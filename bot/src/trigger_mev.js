const { createWalletClient, http, encodeFunctionData, parseEther } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, "../../.env") });

const UNICHAIN_SEPOLIA_RPC = process.env.UNICHAIN_SEPOLIA_RPC_URL || 'https://sepolia.unichain.org';
const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;
const HOOK_ADDRESS = process.env.MEV_HOOK_ADDRESS;

const account = privateKeyToAccount(PRIVATE_KEY);

const client = createWalletClient({
    account,
    transport: http(UNICHAIN_SEPOLIA_RPC)
});

async function triggerMEV() {
    console.log("🚀 TRIGGERING REAL ON-CHAIN MEV ALERT...");
    console.log("Contract:", HOOK_ADDRESS);
    console.log("Account:", account.address);

    // We simulate an MEV Alert by calling a function that emits the event.
    // In our MEVengersHook, any swap with high score emits MEVAlert.
    // For this test, we can use the lockPool directly or a mock swap if available.
    // Let's use a raw transaction to the hook that we know will trigger logic.

    const poolId = "0x" + require('crypto').randomBytes(32).toString('hex');

    // The most direct way to trigger the WHOLE flow is to simulate the event emission
    // logic in the hook. Since we are owners, we can call lockPool which also notifies sentinel.

    const abi = [{
        "type": "function",
        "name": "lockPool",
        "inputs": [{ "name": "poolId", "type": "bytes32" }],
        "outputs": [],
        "stateMutability": "nonpayable"
    }];

    try {
        const hash = await client.writeContract({
            address: HOOK_ADDRESS,
            abi: abi,
            functionName: "lockPool",
            args: [poolId],
            chain: { id: 1301, name: 'Unichain Sepolia', nativeCurrency: { decimals: 18, name: 'Ether', symbol: 'ETH' }, rpcUrls: { default: { http: [UNICHAIN_SEPOLIA_RPC] } } }
        });
        console.log("✅ Transaction Sent! Hash:", hash);
        console.log("🔗 View on Explorer: https://sepolia.uniscan.xyz/tx/" + hash);
    } catch (e) {
        console.error("❌ Failed:", e.message);
    }
}

triggerMEV();
