// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {PoolId} from "v4-core/src/types/PoolId.sol";

/// @title MEVInsuranceFund
/// @notice Custodies the community insurance pot for each pool and handles victim compensation.
/// @dev Funded automatically by MEVengersHook during auction settlements.
contract MEVInsuranceFund is Ownable {

    // =========================================================
    //                    STATE
    // =========================================================

    /// @notice Authorised hook address that can deposit funds
    address public mevHook;

    /// @notice Tracks balance per pool
    mapping(PoolId => uint256) public fundBalance;

    /// @notice ETH claimed per victim address (for transparency)
    mapping(address => uint256) public claimedAmount;

    // =========================================================
    //                    EVENTS
    // =========================================================

    event FundDeposited(PoolId indexed poolId, uint256 amount, uint256 newTotal);
    event ClaimPaid(PoolId indexed poolId, address indexed victim, uint256 amount);

    // =========================================================
    //                    ERRORS
    // =========================================================

    error OnlyHook();
    error InsufficientFund();
    error ZeroAmount();

    // =========================================================
    //                    CONSTRUCTOR
    // =========================================================

    constructor() Ownable(msg.sender) {}

    // =========================================================
    //                    ADMIN
    // =========================================================

    function setHook(address _hook) external onlyOwner {
        mevHook = _hook;
    }

    // =========================================================
    //                    DEPOSIT (called by Hook on settlement)
    // =========================================================

    /// @notice Accepts ETH deposits from the MEVengersHook settlement
    function deposit(PoolId poolId) external payable {
        if (msg.sender != mevHook && msg.sender != owner()) revert OnlyHook();
        if (msg.value == 0) revert ZeroAmount();

        fundBalance[poolId] += msg.value;
        emit FundDeposited(poolId, msg.value, fundBalance[poolId]);
    }

    // =========================================================
    //                    CLAIM (victim compensation)
    // =========================================================

    /// @notice Owner distributes insurance to verified victims.
    ///         In a future version, this will be proven via ZK-proof or oracle.
    function payClaim(PoolId poolId, address payable victim, uint256 amount) external onlyOwner {
        if (amount == 0) revert ZeroAmount();
        if (fundBalance[poolId] < amount) revert InsufficientFund();

        fundBalance[poolId] -= amount;
        claimedAmount[victim] += amount;

        (bool ok,) = victim.call{value: amount}("");
        require(ok, "Transfer failed");

        emit ClaimPaid(poolId, victim, amount);
    }

    // =========================================================
    //                    RECEIVE ETH
    // =========================================================

    receive() external payable {}
}
