const { createWalletClient, http, parseEther } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, "../../.env") });

const UNICHAIN_SEPOLIA_RPC = process.env.UNICHAIN_SEPOLIA_RPC_URL || 'https://sepolia.unichain.org';
const PRIVATE_KEY = process.env.ALICE_PRIVATE_KEY;
const HOOK_ADDRESS = process.env.MEV_HOOK_ADDRESS;

const account = privateKeyToAccount(PRIVATE_KEY);
const client = createWalletClient({ account, transport: http(UNICHAIN_SEPOLIA_RPC) });

async function placeBid(poolId, feeBps) {
    console.log(`🚀 ALICE PLACING BID on pool ${poolId}...`);
    const abi = [{
        "type": "function", "name": "placeBid",
        "inputs": [{ "name": "poolId", "type": "bytes32" }, { "name": "feeBps", "type": "uint24" }],
        "outputs": [], "stateMutability": "payable"
    }];
    try {
        const hash = await client.writeContract({
            address: HOOK_ADDRESS, abi: abi, functionName: "placeBid",
            args: [poolId, feeBps], value: parseEther("0.001"),
            chain: { id: 1301, name: 'Unichain Sepolia', nativeCurrency: { decimals: 18, name: 'Ether', symbol: 'ETH' }, rpcUrls: { default: { http: [UNICHAIN_SEPOLIA_RPC] } } }
        });
        console.log("✅ Bid Transaction Sent! Hash:", hash);
    } catch (e) {
        console.error("❌ Failed:", e.message);
    }
}

const poolId = process.argv[2];
const feeBps = 500;
if (!poolId) console.log("Please provide a poolId");
else placeBid(poolId, feeBps);
