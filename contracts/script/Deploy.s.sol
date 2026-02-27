// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {MEVengersHook} from "../src/MEVengersHook.sol";
import {MEVInsuranceFund} from "../src/MEVInsuranceFund.sol";

/// @notice Deployment script for Unichain.
///         The MEVAuctionSentinel is deployed separately on the Reactive Network.
contract DeployMEVengers is Script {
    // Unichain Sepolia PoolManager address (update for mainnet)
    address constant POOL_MANAGER = 0x00B036B58a80E7c01afafd2c02f67Dc281D60823;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy Insurance Fund
        MEVInsuranceFund fund = new MEVInsuranceFund();
        console.log("MEVInsuranceFund deployed at:", address(fund));

        // 2. Deploy the Hook
        MEVengersHook hook = new MEVengersHook(
            IPoolManager(POOL_MANAGER),
            deployer
        );
        console.log("MEVengersHook deployed at:", address(hook));

        // 3. Wire the fund to accept deposits from the hook
        fund.setHook(address(hook));

        console.log("--- Deployment Complete ---");
        console.log("Next Step: deploy MEVAuctionSentinel on Reactive Network, then call hook.setSentinel(sentinelAddress)");

        vm.stopBroadcast();
    }
}
