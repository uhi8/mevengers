const { createPublicClient, http, formatEther } = require("viem");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

const UNICHAIN_RPC = process.env.UNICHAIN_SEPOLIA_RPC_URL || "https://sepolia.unichain.org";
const client = createPublicClient({ transport: http(UNICHAIN_RPC) });
const HOOK_ADDRESS = process.env.MEV_HOOK_ADDRESS;

const ABI = [{
    type: 'function',
    name: 'auctions',
    inputs: [{ name: 'poolId', type: 'bytes32' }],
    outputs: [
        { name: 'locked', type: 'bool' },
        { name: 'auctionStart', type: 'uint256' },
        { name: 'auctionEnd', type: 'uint256' },
        { name: 'highestBidder', type: 'address' },
        { name: 'highestBid', type: 'uint256' },
        { name: 'winningFee', type: 'uint24' }
    ],
    stateMutability: 'view'
}];

async function check(poolId) {
    if (!poolId.startsWith("0x")) poolId = "0x" + poolId;
    console.log(`🔍 Checking Auction State for Pool: ${poolId}`);
    try {
        const result = await client.readContract({
            address: HOOK_ADDRESS,
            abi: ABI,
            functionName: 'auctions',
            args: [poolId]
        });
        console.log("Result:", {
            locked: result[0],
            auctionStart: result[1].toString(),
            auctionEnd: result[2].toString(),
            highestBidder: result[3],
            highestBid: formatEther(result[4]) + " ETH",
            winningFee: result[5],
            now: Math.floor(Date.now() / 1000)
        });
    } catch (e) {
        console.error("❌ Failed:", e.message);
    }
}

const poolId = process.argv[2];
if (!poolId) {
    console.log("Please provide a poolId");
} else {
    check(poolId);
}
