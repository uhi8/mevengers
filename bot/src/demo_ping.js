const { createWalletClient, createPublicClient, http, parseEther } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, "../../.env") });

const UNICHAIN_SEPOLIA_RPC = process.env.UNICHAIN_SEPOLIA_RPC_URL || 'https://sepolia.unichain.org';
const DEPLOYER_PK = process.env.DEPLOYER_PRIVATE_KEY;
const BOB_PK = process.env.BOB_PRIVATE_KEY;
const HOOK_ADDRESS = process.env.MEV_HOOK_ADDRESS;

if (!DEPLOYER_PK || !BOB_PK || !HOOK_ADDRESS) {
    console.error("Missing environment variables");
    process.exit(1);
}

const deployer = privateKeyToAccount(DEPLOYER_PK);
const bob = privateKeyToAccount(BOB_PK);

const chain = { id: 1301, name: 'Unichain Sepolia', nativeCurrency: { decimals: 18, name: 'Ether', symbol: 'ETH' }, rpcUrls: { default: { http: [UNICHAIN_SEPOLIA_RPC] } } };

const clientDeployer = createWalletClient({ account: deployer, chain, transport: http(UNICHAIN_SEPOLIA_RPC) });
const clientBob = createWalletClient({ account: bob, chain, transport: http(UNICHAIN_SEPOLIA_RPC) });
const publicClient = createPublicClient({ chain, transport: http(UNICHAIN_SEPOLIA_RPC) });

async function runTest() {
    const poolId = "0x" + require('crypto').randomBytes(32).toString('hex');
    console.log(`\n========================================`);
    console.log(`🚀 TEST TRIGGER: Starting simulated MEV attack lock`);
    console.log(`========================================`);
    console.log(`Pool ID: ${poolId}`);

    // Lock the pool
    try {
        const hash = await clientDeployer.writeContract({
            address: HOOK_ADDRESS,
            abi: [{ "type": "function", "name": "lockPool", "inputs": [{ "name": "poolId", "type": "bytes32" }], "outputs": [], "stateMutability": "nonpayable" }],
            functionName: "lockPool",
            args: [poolId]
        });
        console.log(`🔒 Sent lockPool transaction. Waiting for receipt...\n   Explorer: https://sepolia.uniscan.xyz/tx/${hash}`);
        await publicClient.waitForTransactionReceipt({ hash });
        console.log(`✅ Pool locked successfully.`);

        console.log(`\n========================================`);
        console.log(`🙋‍♂️ TEST TRIGGER: Bob places a tiny bid`);
        console.log(`========================================`);
        const bidHash = await clientBob.writeContract({
            address: HOOK_ADDRESS,
            abi: [{ "type": "function", "name": "placeBid", "inputs": [{ "name": "poolId", "type": "bytes32" }, { "name": "feeBps", "type": "uint24" }], "outputs": [], "stateMutability": "payable" }],
            functionName: "placeBid",
            args: [poolId, 500],
            value: parseEther("0.0000001") // Very small bid to save testnet ETH
        });
        console.log(`💸 Sent placeBid transaction. Waiting for receipt...\n   Explorer: https://sepolia.uniscan.xyz/tx/${bidHash}`);
        await publicClient.waitForTransactionReceipt({ hash: bidHash });
        console.log(`✅ Bid placed successfully.`);
        
        console.log(`\nCheck the Agent and Bot console outputs! They should show incoming events!`);
    } catch (e) {
        console.error("❌ Test Failed:", e.message);
    }
}

runTest();
