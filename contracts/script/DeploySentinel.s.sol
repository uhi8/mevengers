// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {MEVAuctionSentinel} from "../src/MEVAuctionSentinel.sol";

contract DeploySentinel is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
        vm.startBroadcast(deployerPrivateKey);

        // CONFIGURATION (Using Aegis/Lasna standard)
        address REACTIVE_SYSTEM_SERVICE = 0x0000000000000000000000000000000000fffFfF;
        
        // Load Unichain addresses from env or hardcode from previous step
        address hook = 0x0cbdf9B816478ED6986B3082A8F1C279041240C0;
        address registry = 0x170e2A44EA353bC11c6Ee7e28D80F802546022BA;
        address aiAgent = deployer; // Use deployer as the AI Agent identity for MVP

        MEVAuctionSentinel sentinel = new MEVAuctionSentinel(
            hook,
            registry,
            aiAgent
        );
        
        console.log("MEVAuctionSentinel deployed to:", address(sentinel));

        // Subscribe to MEVAlert events on Unichain
        // sentinel.subscribeToMEVAlerts();
        // console.log("Subscribed to MEVAlerts on Unichain.");

        vm.stopBroadcast();
    }
}
