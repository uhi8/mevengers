// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {HookMiner} from "../src/HookMiner.sol";
import {MEVengersHook} from "../src/MEVengersHook.sol";
import {MEVInsuranceFund} from "../src/MEVInsuranceFund.sol";
import {MEVengersAgentRegistry} from "../src/MEVengersAgentRegistry.sol";

/// @title Deploy MEVengers
/// @notice Deploys the Hook, Insurance Fund, and Agent Registry on Unichain Sepolia.
///         The MEVAuctionSentinel is deployed separately on the Reactive Network.
contract DeployMEVengers is Script {
    // Unichain Sepolia PoolManager address (Aegis reference)
    address constant POOL_MANAGER = 0x00B036B58a818B1BC34d502D3fE730Db729e62AC;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy the Agent Registry (ERC-8004)
        MEVengersAgentRegistry registry = new MEVengersAgentRegistry();
        console.log("MEVengersAgentRegistry deployed to:", address(registry));

        // 2. Deploy the Insurance Fund
        MEVInsuranceFund insuranceFund = new MEVInsuranceFund();
        console.log("MEVInsuranceFund deployed to:", address(insuranceFund));

        // 3. Deploy the Hook (requires salt mining for flags)
        // Flags: beforeSwap (1 << 7) | afterSwap (1 << 8) = 128 | 256 = 384 (0x180)
        uint160 flags = uint160(Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG);
        
        (address hookAddress, bytes32 salt) = HookMiner.find(
            0x4e59b44847b379578588920cA78FbF26c0B4956C, // Standard CREATE2 Proxy
            flags,
            type(MEVengersHook).creationCode,
            abi.encode(address(POOL_MANAGER), deployer)
        );

        MEVengersHook hook = new MEVengersHook{salt: salt}(IPoolManager(POOL_MANAGER), deployer);
        require(address(hook) == hookAddress, "Hook address mismatch");
        console.log("MEVengersHook deployed to:", address(hook));

        // 4. Wire everything together
        hook.setAgentRegistry(address(registry));
        insuranceFund.setHook(address(hook));
        
        console.log("System wired up successfully.");

        vm.stopBroadcast();
    }
}
