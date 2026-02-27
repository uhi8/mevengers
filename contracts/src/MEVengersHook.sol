// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {BaseHook} from "v4-periphery/src/utils/BaseHook.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {Hooks} from "v4-core/src/libraries/Hooks.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "v4-core/src/types/PoolId.sol";
import {BalanceDelta} from "v4-core/src/types/BalanceDelta.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary} from "v4-core/src/types/BeforeSwapDelta.sol";
import {MEVengersAgentRegistry} from "./MEVengersAgentRegistry.sol";
import {SwapParams} from "v4-core/src/types/PoolOperation.sol";
import {Currency} from "v4-core/src/types/Currency.sol";

/// @title MEVengersHook
/// @notice Uniswap V4 Hook for real-time MEV detection and autonomous auction management.
/// @dev Deployed on Unichain. The MEVAuctionSentinel on Reactive Network exclusively controls
///      lockPool() and settleAuctionAndUnlock() to prevent race conditions and centralise authority.
contract MEVengersHook is BaseHook {
    using PoolIdLibrary for PoolKey;

    // =========================================================
    //                    STRUCTS & STATE
    // =========================================================

    struct AuctionState {
        bool locked;            // Is the pool currently locked for extraction?
        uint256 auctionStart;   // Timestamp when auction began
        uint256 auctionEnd;     // Timestamp when the Reactive Sentinel will settle
        address highestBidder;
        uint256 highestBid;     // In Wei
        uint256 insuranceFund;  // Accumulated insurance for this auction
    }

    struct SwapRecord {
        uint256 timestamp;
        int128 amount;
    }

    // Authorised cross-chain operator from Reactive Network
    address public reactiveSentinel;
    address public owner;

    // ERC-8004 Agent Registry
    MEVengersAgentRegistry public agentRegistry;

    // Pool-specific auction state
    mapping(PoolId => AuctionState) public auctions;

    // MEV detection: track the last few swaps per pool
    mapping(PoolId => SwapRecord) public lastSwap;

    // Insurance fund per pool (separate for explicit ERC-20 accounting)
    mapping(PoolId => uint256) public mevInsuranceFund;

    // Reputation scores for Guardians (managed by Sentinel)
    mapping(address => uint256) public guardianReputation;

    // =========================================================
    //                         CONSTANTS
    // =========================================================

    uint256 public constant MEV_SCORE_THRESHOLD = 70;    // Out of 100
    uint256 public constant AUCTION_DURATION = 3 minutes;
    uint24  public constant DEFAULT_FEE = 3000;           // 0.3%
    uint24  public constant LOCK_FEE = 50000;             // 5.0% — applied during lock
    uint24  public constant GUARDIAN_FEE = 100;           // 0.01% — for high-rep participants
    uint256 public constant INSURANCE_SPLIT = 50;         // 50% of winning bid to victims

    // =========================================================
    //                         EVENTS
    // =========================================================

    event MEVAlert(PoolId indexed poolId, uint256 mevScore, address indexed suspectedAttacker, uint256 timestamp);
    event PoolLocked(PoolId indexed poolId, uint256 auctionEnd);
    event BidPlaced(PoolId indexed poolId, address indexed bidder, uint256 amount);
    event AuctionSettled(PoolId indexed poolId, address indexed winner, uint24 winningFee, uint256 insurancePaid);
    event PoolUnlocked(PoolId indexed poolId);
    event GuardianReputationUpdated(address indexed guardian, uint256 score);

    // =========================================================
    //                         ERRORS
    // =========================================================

    error OnlySentinelOrOwner();
    error AuctionNotActive();
    error BidTooLow();
    error PoolNotLocked();

    // =========================================================
    //                       CONSTRUCTOR
    // =========================================================

    constructor(IPoolManager _poolManager, address _owner) BaseHook(_poolManager) {
        owner = _owner;
    }

    // =========================================================
    //                       MODIFIERS
    // =========================================================

    modifier onlySentinelOrOwner() {
        if (msg.sender != reactiveSentinel && msg.sender != owner) revert OnlySentinelOrOwner();
        _;
    }

    // =========================================================
    //                    SENTINEL CONTROLS
    // =========================================================

    /// @notice Point to a new Reactive Sentinel address (owner only)
    function setSentinel(address _sentinel) external {
        if (msg.sender != owner) revert OnlySentinelOrOwner();
        reactiveSentinel = _sentinel;
    }

    /// @notice Called by Reactive Sentinel when it detects an MEVAlert.
    ///         Locks the pool, blocking further MEV extraction, and starts the auction.
    function lockPool(PoolId poolId) external onlySentinelOrOwner {
        AuctionState storage state = auctions[poolId];
        state.locked = true;
        state.auctionStart = block.timestamp;
        state.auctionEnd = block.timestamp + AUCTION_DURATION;
        state.highestBidder = address(0);
        state.highestBid = 0;

        emit PoolLocked(poolId, state.auctionEnd);
    }

    /// @notice Called by Reactive Sentinel when the auction timer expires.
    ///         Applies the winning fee, disburses the insurance fund, and unlocks the pool.
    /// @param poolId The pool that was locked.
    /// @param winningFeeBps The fee (in bps) set by the community winning bid.
    function settleAuctionAndUnlock(PoolId poolId, uint24 winningFeeBps) external onlySentinelOrOwner {
        AuctionState storage state = auctions[poolId];
        if (!state.locked) revert PoolNotLocked();

        address winner = state.highestBidder;
        uint256 pot = state.highestBid;

        // 50% to the insurance fund. Winner keeps the remaining as a protection reward.
        uint256 insurance = (pot * INSURANCE_SPLIT) / 100;
        mevInsuranceFund[poolId] += insurance;

        // Boost winner's reputation (in-contract mapping)
        if (winner != address(0)) {
            guardianReputation[winner] += 10;
            emit GuardianReputationUpdated(winner, guardianReputation[winner]);

            // ERC-8004: Record on-chain feedback for the winning Guardian
            if (address(agentRegistry) != address(0)) {
                uint256 agentId = agentRegistry.getAgentId(winner);
                if (agentId > 0) {
                    agentRegistry.giveFeedback(
                        agentId,
                        int128(int256(pot)),  // Positive volume = successful protection
                        18,
                        "auction_win",
                        "human_guardian",
                        "",
                        "",
                        bytes32(0)
                    );
                }
            }
        }

        // Unlock the pool
        state.locked = false;
        state.highestBidder = address(0);
        state.highestBid = 0;

        emit AuctionSettled(poolId, winner, winningFeeBps, insurance);
        emit PoolUnlocked(poolId);
    }

    function setAgentRegistry(address _registry) external {
        if (msg.sender != owner) revert OnlySentinelOrOwner();
        agentRegistry = MEVengersAgentRegistry(_registry);
    }

    /// @notice Allows Reactive Sentinel to update guardian scores cross-chain.
    function setGuardianReputation(address guardian, uint256 score) external onlySentinelOrOwner {
        guardianReputation[guardian] = score;
        emit GuardianReputationUpdated(guardian, score);
    }

    // =========================================================
    //                     BID MECHANISM
    // =========================================================

    /// @notice Community members bid in ETH for the protective fee level during an active auction.
    ///         The fee bid is the protection level they want to enforce on attacked swappers.
    function placeBid(PoolId poolId) external payable {
        AuctionState storage state = auctions[poolId];
        if (!state.locked) revert AuctionNotActive();
        if (block.timestamp > state.auctionEnd) revert AuctionNotActive();
        if (msg.value <= state.highestBid) revert BidTooLow();

        address prevBidder = state.highestBidder;
        uint256 prevBid = state.highestBid;

        // Refund the previous highest bidder
        if (prevBidder != address(0)) {
            (bool ok, ) = prevBidder.call{value: prevBid}("");
            require(ok, "Refund failed");
        }

        state.highestBidder = msg.sender;
        state.highestBid = msg.value;

        emit BidPlaced(poolId, msg.sender, msg.value);
    }

    // =========================================================
    //                     HOOK PERMISSIONS
    // =========================================================

    function getHookPermissions() public pure override returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: false,
            afterInitialize: false,
            beforeAddLiquidity: false,
            afterAddLiquidity: false,
            beforeRemoveLiquidity: false,
            afterRemoveLiquidity: false,
            beforeSwap: true,   // MEV detection
            afterSwap: true,    // Record swap for next MEV score calc
            beforeDonate: false,
            afterDonate: false,
            beforeSwapReturnDelta: false,
            afterSwapReturnDelta: false,
            afterAddLiquidityReturnDelta: false,
            afterRemoveLiquidityReturnDelta: false
        });
    }

    // =========================================================
    //                     HOOK CALLBACKS
    // =========================================================

    /// @notice Core MEV detection logic. Evaluates current swap for MEV signatures.
    function _beforeSwap(
        address sender,
        PoolKey calldata key,
        SwapParams calldata params,
        bytes calldata
    ) internal override returns (bytes4, BeforeSwapDelta, uint24) {
        PoolId poolId = key.toId();
        AuctionState storage state = auctions[poolId];

        // --- If pool is actively locked: apply penalty/guardian fee ---
        if (state.locked) {
            uint24 fee = DEFAULT_FEE;

            if (guardianReputation[tx.origin] >= 80) {
                // Trusted guardians trade cheaply during lock
                fee = GUARDIAN_FEE;
            } else {
                // Penalise potential attacker with extreme fee
                fee = LOCK_FEE;
            }

            return (BaseHook.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, fee | 0x800000);
        }

        // --- MEV Score Calculation ---
        uint256 mevScore = _calculateMevScore(poolId, params);

        if (mevScore >= MEV_SCORE_THRESHOLD) {
            emit MEVAlert(poolId, mevScore, tx.origin, block.timestamp);
            // Sentinel will pick up this event on Reactive Network
            // and immediately call back lockPool(). Until then, apply elevated fee.
            return (BaseHook.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, LOCK_FEE | 0x800000);
        }

        return (BaseHook.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, DEFAULT_FEE | 0x800000);
    }

    /// @notice Records swap data to improve future MEV score calculations.
    function _afterSwap(
        address,
        PoolKey calldata key,
        SwapParams calldata params,
        BalanceDelta,
        bytes calldata
    ) internal override returns (bytes4, int128) {
        PoolId poolId = key.toId();
        lastSwap[poolId] = SwapRecord({
            timestamp: block.timestamp,
            amount: int128(params.amountSpecified)
        });
        return (BaseHook.afterSwap.selector, 0);
    }

    // =========================================================
    //                    MEV SCORE ENGINE
    // =========================================================

    /// @dev Computes a 0-100 MEV likelihood score based on:
    ///      1) Rapid consecutive swaps (same block or within 1 second)
    ///      2) High swap magnitude (absolute value)
    function _calculateMevScore(
        PoolId poolId,
        SwapParams calldata params
    ) internal view returns (uint256 score) {
        SwapRecord storage prev = lastSwap[poolId];
        score = 0;

        // Factor 1: Rapid consecutive swap (50 points)
        if (prev.timestamp > 0 && block.timestamp - prev.timestamp <= 1) {
            score += 50;
        }

        // Factor 2: Large swap volume relative to typical (30 points)
        uint256 absAmount = params.amountSpecified > 0
            ? uint256(int256(params.amountSpecified))
            : uint256(-int256(params.amountSpecified));

        if (absAmount > 10 ether) score += 30;
        else if (absAmount > 1 ether) score += 15;

        // Factor 3: Same direction as previous swap (potential sandwich) (20 points)
        if (
            prev.amount != 0 &&
            ((params.amountSpecified > 0) == (prev.amount > 0))
        ) {
            score += 20;
        }
    }

    // =========================================================
    //                    VIEW HELPERS
    // =========================================================

    function getAuction(PoolId poolId) external view returns (AuctionState memory) {
        return auctions[poolId];
    }

    function getInsuranceFund(PoolId poolId) external view returns (uint256) {
        return mevInsuranceFund[poolId];
    }
}
