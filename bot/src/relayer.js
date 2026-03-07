const { createPublicClient, createWalletClient, http, parseAbiItem, defineChain } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, "../../.env") });

// Define Unichain Sepolia for viem
const unichainSepolia = defineChain({
    id: 1301,
    name: 'Unichain Sepolia',
    network: 'unichain-sepolia',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: {
        default: { http: [process.env.UNICHAIN_SEPOLIA_RPC_URL || 'https://sepolia.unichain.org'] },
        public: { http: [process.env.UNICHAIN_SEPOLIA_RPC_URL || 'https://sepolia.unichain.org'] },
    },
    blockExplorers: {
        default: { name: 'Uniscan', url: 'https://sepolia.uniscan.xyz' },
    },
    testnet: true,
});

const HOOK_ADDRESS = process.env.MEV_HOOK_ADDRESS;
const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;

if (!HOOK_ADDRESS || !PRIVATE_KEY) {
    console.error("❌ Missing MEV_HOOK_ADDRESS or DEPLOYER_PRIVATE_KEY in .env");
    process.exit(1);
}

const account = privateKeyToAccount(PRIVATE_KEY);

const publicClient = createPublicClient({
    chain: unichainSepolia,
    transport: http(),
});

const walletClient = createWalletClient({
    account,
    chain: unichainSepolia,
    transport: http(),
});

// ABI for MEVAlert event and lockPool function
const MEV_HOOK_ABI = [
    {
        "type": "event",
        "name": "MEVAlert",
        "inputs": [
            { "name": "poolId", "type": "bytes32", "indexed": true },
            { "name": "mevScore", "type": "uint256", "indexed": false },
            { "name": "suspectedAttacker", "type": "address", "indexed": true },
            { "name": "timestamp", "type": "uint256", "indexed": false }
        ]
    },
    {
        "type": "function",
        "name": "lockPool",
        "inputs": [{ "name": "poolId", "type": "bytes32" }],
        "outputs": [],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "getAuction",
        "inputs": [{ "name": "poolId", "type": "bytes32" }],
        "outputs": [
            {
                "name": "",
                "type": "tuple",
                "components": [
                    { "name": "locked", "type": "bool" },
                    { "name": "auctionStart", "type": "uint256" },
                    { "name": "auctionEnd", "type": "uint256" },
                    { "name": "highestBidder", "type": "address" },
                    { "name": "highestBid", "type": "uint256" },
                    { "name": "insuranceFund", "type": "uint256" }
                ]
            }
        ],
        "stateMutability": "view"
    }
];

const FALLBACK_TIMEOUT_MS = 10000; // 10 seconds to wait for Reactive Sentinel

async function main() {
    console.log(`🛡️  MEVengers Hybrid Relayer started!`);
    console.log(`📡 Monitoring Hook: ${HOOK_ADDRESS}`);
    console.log(`🗝️  Account: ${account.address}`);

    // Watch for MEVAlert events
    publicClient.watchContractEvent({
        address: HOOK_ADDRESS,
        abi: MEV_HOOK_ABI,
        eventName: 'MEVAlert',
        onLogs: async (logs) => {
            for (const log of logs) {
                const { poolId, mevScore, suspectedAttacker } = log.args;
                console.log(`⚠️  MEV Alert Detected! Pool: ${poolId}, Score: ${mevScore}, Attacker: ${suspectedAttacker}`);

                // Wait for Reactive Sentinel to react
                console.log(`⏳ Waiting ${FALLBACK_TIMEOUT_MS / 1000}s for Reactive Sentinel...`);
                setTimeout(async () => {
                    try {
                        // Check if pool is locked
                        const auctionState = await publicClient.readContract({
                            address: HOOK_ADDRESS,
                            abi: MEV_HOOK_ABI,
                            functionName: 'getAuction',
                            args: [poolId],
                        });

                        if (auctionState.locked) {
                            console.log(`✅ Reactive Sentinel successfully locked the pool. No fallback needed.`);
                        } else {
                            console.log(`🚨 Reactive Sentinel timeout/lag! Triggering fallback lock...`);
                            const hash = await walletClient.writeContract({
                                address: HOOK_ADDRESS,
                                abi: MEV_HOOK_ABI,
                                functionName: 'lockPool',
                                args: [poolId],
                            });
                            console.log(`🚀 Fallback transaction submitted: ${hash}`);
                        }
                    } catch (error) {
                        console.error(`❌ Error in fallback logic:`, error.message);
                    }
                }, FALLBACK_TIMEOUT_MS);
            }
        },
    });
}

main().catch((err) => {
    console.error("🔥 Fatal error:", err);
    process.exit(1);
});
