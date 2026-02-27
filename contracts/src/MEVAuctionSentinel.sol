// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IReactive} from "reactive-lib/interfaces/IReactive.sol";
import {AbstractReactive} from "reactive-lib/abstract-base/AbstractReactive.sol";

/// @title MEVAuctionSentinel
/// @notice Deployed on the Reactive Network. Autonomously manages the MEVengers auction lifecycle:
///         1. Catches MEVAlert from Unichain
///         2. Instantly emits lockPool() callback
///         3. After AUCTION_DURATION, emits settleAuctionAndUnlock() callback
///
/// @dev The key innovation over a simple "panic switch" is that the Sentinel tracks time
///      autonomously and fires settlement without any human keeper.
contract MEVAuctionSentinel is AbstractReactive {

    // =========================================================
    //                    CONFIGURATION
    // =========================================================

    address public owner;
    address public mevHook;             // MEVengersHook on Unichain
    address public agentRegistry;       // MEVengersAgentRegistry on Unichain
    address public aiAgentAddress;      // The registered AI agent wallet address

    uint256 public constant UNICHAIN_ID = 1301;     // Unichain Mainnet
    uint256 public constant UNICHAIN_SEPOLIA_ID = 1301; // Unichain Sepolia testnet

    uint256 public constant AUCTION_DURATION = 180; // seconds — matches the Hook

    // PoolId => auction end timestamp (tracked on Reactive side)
    mapping(bytes32 => uint256) public auctionEnds;

    // =========================================================
    //                       EVENTS
    // =========================================================

    event SentinelActivated(bytes32 indexed poolId, uint256 mevScore, uint256 auctionEnd);
    event SettlementDispatched(bytes32 indexed poolId, uint24 winningFee);

    // =========================================================
    //                     CONSTRUCTOR
    // =========================================================

    constructor(address _mevHook, address _agentRegistry, address _aiAgent) AbstractReactive() {
        owner = msg.sender;
        mevHook = _mevHook;
        agentRegistry = _agentRegistry;
        aiAgentAddress = _aiAgent;
    }

    // =========================================================
    //                    SUBSCRIPTION SETUP
    // =========================================================

    /// @notice Subscribe to MEVAlert events emitted by the MEVengersHook on Unichain.
    ///         Must be called by owner after deployment.
    function subscribeToMEVAlerts() external {
        require(msg.sender == owner, "Only owner");

        // Topic 0 = keccak256("MEVAlert(bytes32,uint256,address,uint256)")
        bytes memory payload = abi.encodeWithSignature(
            "subscribe(uint256,address,uint256,uint256,uint256,uint256)",
            UNICHAIN_ID,
            mevHook,
            uint256(keccak256("MEVAlert(bytes32,uint256,address,uint256)")),
            REACTIVE_IGNORE,
            REACTIVE_IGNORE,
            REACTIVE_IGNORE
        );
        (bool success,) = address(service).call(payload);
        require(success, "Subscription failed");
    }

    // =========================================================
    //                    REACT FUNCTION (core)
    // =========================================================

    /// @notice Called by the Reactive VM when a subscribed event is detected.
    ///         This is the heart of the autonomous auction manager.
    function react(LogRecord calldata log) external override vmOnly {
        // --- Handle MEVAlert ---
        if (
            log.chain_id == UNICHAIN_ID &&
            log.topic_0 == uint256(keccak256("MEVAlert(bytes32,uint256,address,uint256)"))
        ) {
            bytes32 poolId = bytes32(log.topic_1);
            (uint256 mevScore,,) = abi.decode(log.data, (uint256, address, uint256));

            // STEP 1: Dispatch lockPool() callback to Unichain
            bytes memory lockPayload = abi.encodeWithSignature(
                "lockPool(bytes32)",
                poolId
            );
            emitCallback(UNICHAIN_ID, mevHook, 500_000, lockPayload);

            // STEP 2: ERC-8004 — Reward the AI Agent for the successful alert
            // The AI Agent has a registered identity in MEVengersAgentRegistry.
            // This records verifiable on-chain proof that the AI caught the MEV.
            if (agentRegistry != address(0) && aiAgentAddress != address(0)) {
                bytes memory feedbackPayload = abi.encodeWithSignature(
                    "giveFeedback(address,uint256,int128,uint8,string,string,string,string,bytes32)",
                    aiAgentAddress,
                    agentRegistry,
                    int128(int256(mevScore)),   // score as the value
                    0,
                    "mev_block",                // tag1: what happened
                    "pre_emptive_ai",           // tag2: who detected it
                    "",
                    "",
                    bytes32(0)
                );
                // Call giveFeedback via the registry on Unichain
                bytes memory registryPayload = abi.encodeWithSignature(
                    "giveFeedbackByAddress(address,int128,uint8,string,string,string,string,bytes32)",
                    aiAgentAddress,
                    int128(int256(mevScore)),
                    0,
                    "mev_block",
                    "pre_emptive_ai",
                    "",
                    "",
                    bytes32(0)
                );
                emitCallback(UNICHAIN_ID, agentRegistry, 300_000, registryPayload);
            }

            // Track auction end on Reactive side
            uint256 auctionEnd = block.timestamp + AUCTION_DURATION;
            auctionEnds[poolId] = auctionEnd;

            emit SentinelActivated(poolId, mevScore, auctionEnd);
        }

        // --- Handle Timer / Block Tick (for autonomous settlement) ---
        // In Reactive Network, the Sentinel can also subscribe to periodic block events.
        // Here we check if any tracked pools have expired auctions and settle them.
        // NOTE: In production, integrate with Reactive's native timer or subscribe to
        //       a periodic heartbeat contract to trigger this path.
        if (log.chain_id == UNICHAIN_ID) {
            _checkAndSettleExpiredAuctions(log);
        }
    }

    /// @dev Internal function to loop through known active auctions and settle those past deadline.
    ///      In a production setup, use Reactive's subscribeToTimer() to fire this periodically.
    function _checkAndSettleExpiredAuctions(LogRecord calldata log) internal {
        // For the MVP, the settlement is triggered by detecting a BidPlaced event
        // after the auctionEnd timestamp, which signals the auction is ready to close.
        // The winning fee defaults to 3000 bps (0.3%) if there were no bids.
        bytes32 poolId = bytes32(log.topic_1);

        if (auctionEnds[poolId] > 0 && block.timestamp >= auctionEnds[poolId]) {
            // Default fee if no bids were placed; in production, query highest bid from Hook.
            uint24 winningFee = 3000;

            bytes memory settlePayload = abi.encodeWithSignature(
                "settleAuctionAndUnlock(bytes32,uint24)",
                poolId,
                winningFee
            );
            emitCallback(UNICHAIN_ID, mevHook, 500_000, settlePayload);

            // Clear tracking
            auctionEnds[poolId] = 0;

            emit SettlementDispatched(poolId, winningFee);
        }
    }

    // =========================================================
    //                    HELPER
    // =========================================================

    function emitCallback(
        uint256 chain_id,
        address _contract,
        uint64 gas_limit,
        bytes memory payload
    ) internal {
        emit Callback(chain_id, _contract, gas_limit, payload);
    }
}
