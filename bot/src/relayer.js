const { createPublicClient, createWalletClient, http, defineChain } = require('viem');
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

// ABI for lock + settlement fallback flows
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
        "type": "event",
        "name": "PoolLocked",
        "inputs": [
            { "name": "poolId", "type": "bytes32", "indexed": true },
            { "name": "auctionEnd", "type": "uint256", "indexed": false }
        ]
    },
    {
        "type": "event",
        "name": "AuctionSettled",
        "inputs": [
            { "name": "poolId", "type": "bytes32", "indexed": true },
            { "name": "winner", "type": "address", "indexed": true },
            { "name": "winningFee", "type": "uint24", "indexed": false },
            { "name": "insurancePaid", "type": "uint256", "indexed": false }
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
                    { "name": "winningFee", "type": "uint24" }
                ]
            }
        ],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "settleAuctionAndUnlock",
        "inputs": [
            { "name": "poolId", "type": "bytes32" },
            { "name": "winningFeeBps", "type": "uint24" }
        ],
        "outputs": [],
        "stateMutability": "nonpayable"
    }
];

const FALLBACK_TIMEOUT_MS = 10000; // wait for Reactive lock callback
const SETTLEMENT_BUFFER_MS = 5000; // settle shortly after auction end
const RECOVERY_BLOCK_WINDOW = BigInt(process.env.RELAYER_RECOVERY_BLOCK_WINDOW || '5000');

/** @type {Map<string, NodeJS.Timeout>} */
const settlementTimers = new Map();

function clearSettlementTimer(poolId) {
    const timer = settlementTimers.get(poolId);
    if (timer) {
        clearTimeout(timer);
        settlementTimers.delete(poolId);
    }
}

function scheduleSettlement(poolId, delayMs) {
    clearSettlementTimer(poolId);
    const timer = setTimeout(() => {
        tryFallbackSettlement(poolId);
    }, delayMs);
    settlementTimers.set(poolId, timer);
}

async function tryFallbackSettlement(poolId) {
    try {
        const auctionState = await publicClient.readContract({
            address: HOOK_ADDRESS,
            abi: MEV_HOOK_ABI,
            functionName: 'getAuction',
            args: [poolId],
        });

        const now = Math.floor(Date.now() / 1000);
        const auctionEnd = Number(auctionState.auctionEnd);

        if (!auctionState.locked) {
            console.log(`✅ Auction already settled by Sentinel: ${poolId}`);
            clearSettlementTimer(poolId);
            return;
        }

        if (now < auctionEnd) {
            const waitMs = (auctionEnd - now) * 1000 + SETTLEMENT_BUFFER_MS;
            console.log(`⏳ Auction still active (${poolId}). Rechecking in ${Math.ceil(waitMs / 1000)}s...`);
            scheduleSettlement(poolId, waitMs);
            return;
        }

        const winningFee = Number(auctionState.winningFee || 3000n);
        console.log(`🚨 Sentinel settlement lag detected. Triggering fallback settle: pool=${poolId}, fee=${winningFee}`);

        const hash = await walletClient.writeContract({
            address: HOOK_ADDRESS,
            abi: MEV_HOOK_ABI,
            functionName: 'settleAuctionAndUnlock',
            args: [poolId, winningFee],
        });

        console.log(`🏁 Fallback settlement tx submitted: ${hash}`);
        clearSettlementTimer(poolId);
    } catch (error) {
        console.error(`❌ Fallback settlement error (${poolId}):`, error.message);
        scheduleSettlement(poolId, 15000);
    }
}

async function recoverActiveAuctions() {
    try {
        const latestBlock = await publicClient.getBlockNumber();
        const fromBlock = latestBlock > RECOVERY_BLOCK_WINDOW ? latestBlock - RECOVERY_BLOCK_WINDOW : 0n;

        console.log(`🧰 Startup recovery: scanning PoolLocked logs from block ${fromBlock} to ${latestBlock}...`);

        const lockedEvents = await publicClient.getContractEvents({
            address: HOOK_ADDRESS,
            abi: MEV_HOOK_ABI,
            eventName: 'PoolLocked',
            fromBlock,
            toBlock: latestBlock,
        });

        const candidatePools = new Set();
        for (const ev of lockedEvents) {
            if (ev.args && ev.args.poolId) candidatePools.add(ev.args.poolId);
        }

        let recovered = 0;
        for (const poolId of candidatePools) {
            const auctionState = await publicClient.readContract({
                address: HOOK_ADDRESS,
                abi: MEV_HOOK_ABI,
                functionName: 'getAuction',
                args: [poolId],
            });

            if (!auctionState.locked) continue;

            const now = Math.floor(Date.now() / 1000);
            const delayMs = Math.max(0, (Number(auctionState.auctionEnd) - now) * 1000 + SETTLEMENT_BUFFER_MS);
            scheduleSettlement(poolId, delayMs);
            recovered += 1;
        }

        console.log(`✅ Startup recovery complete. Active auctions recovered: ${recovered}`);
    } catch (error) {
        console.error('❌ Startup recovery failed:', error.message);
    }
}

async function main() {
    console.log(`🛡️  MEVengers Hybrid Relayer started!`);
    console.log(`📡 Monitoring Hook: ${HOOK_ADDRESS}`);
    console.log(`🗝️  Account: ${account.address}`);

    await recoverActiveAuctions();

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
        onError: (err) => console.error('❌ MEVAlert watch error:', err.message),
    });

    // Schedule fallback settlement when pool locks
    publicClient.watchContractEvent({
        address: HOOK_ADDRESS,
        abi: MEV_HOOK_ABI,
        eventName: 'PoolLocked',
        onLogs: async (logs) => {
            for (const log of logs) {
                const { poolId, auctionEnd } = log.args;
                const now = Math.floor(Date.now() / 1000);
                const delayMs = Math.max(0, (Number(auctionEnd) - now) * 1000 + SETTLEMENT_BUFFER_MS);

                console.log(`🔒 PoolLocked: ${poolId}. Fallback settlement scheduled in ${Math.ceil(delayMs / 1000)}s.`);
                scheduleSettlement(poolId, delayMs);
            }
        },
        onError: (err) => console.error('❌ PoolLocked watch error:', err.message),
    });

    // Clear fallback timer if normal settlement already happened
    publicClient.watchContractEvent({
        address: HOOK_ADDRESS,
        abi: MEV_HOOK_ABI,
        eventName: 'AuctionSettled',
        onLogs: async (logs) => {
            for (const log of logs) {
                const { poolId } = log.args;
                clearSettlementTimer(poolId);
                console.log(`🏁 AuctionSettled observed: ${poolId}. Cleared fallback timer.`);
            }
        },
        onError: (err) => console.error('❌ AuctionSettled watch error:', err.message),
    });
}

main().catch((err) => {
    console.error("🔥 Fatal error:", err);
    process.exit(1);
});
