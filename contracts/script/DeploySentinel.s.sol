// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {MEVAuctionSentinel} from "../src/MEVAuctionSentinel.sol";

contract DeploySentinel is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        address hook = vm.envAddress("MEV_HOOK_ADDRESS");
        address registry = vm.envAddress("MEV_AGENT_REGISTRY_ADDRESS");
        bool autoSubscribe = vm.envOr("REACTIVE_AUTO_SUBSCRIBE", false);
        
        vm.startBroadcast(deployerPrivateKey);
        address aiAgent = deployer; // Use deployer as the AI Agent identity for MVP

        MEVAuctionSentinel sentinel = new MEVAuctionSentinel(
            hook,
            registry,
            aiAgent
        );
        
        console.log("MEVAuctionSentinel deployed to:", address(sentinel));

        // Subscribe to MEVAlert events on Unichain
        if (autoSubscribe) {
            sentinel.subscribeToMEVAlerts();
            console.log("Subscribed to MEVAlerts on Unichain.");
        } else {
            console.log("REACTIVE_AUTO_SUBSCRIBE=false; subscription skipped.");
        }

        vm.stopBroadcast();
    }
}
