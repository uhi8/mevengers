const { createPublicClient, createWalletClient, http, parseEther, formatEther } = require("viem");
const { privateKeyToAccount } = require("viem/accounts");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

const UNICHAIN_RPC = process.env.UNICHAIN_SEPOLIA_RPC_URL || "https://sepolia.unichain.org";
const UNICHAIN = {
    id: 1301,
    name: "Unichain Sepolia",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [UNICHAIN_RPC] } },
};

const publicClient = createPublicClient({ chain: UNICHAIN, transport: http(UNICHAIN_RPC) });
const bobAccount = privateKeyToAccount(process.env.BOB_PRIVATE_KEY);
const aliceAccount = privateKeyToAccount(process.env.ALICE_PRIVATE_KEY);

const walletClient = createWalletClient({
    account: bobAccount,
    chain: UNICHAIN,
    transport: http(UNICHAIN_RPC)
});

async function rebalance() {
    console.log(`💸 Transferring 0.001 ETH from Bob to Alice...`);
    try {
        const hash = await walletClient.sendTransaction({
            to: aliceAccount.address,
            value: parseEther("0.0001"),
            gas: 21000n
        });
        console.log(`✅ Success! Hash: ${hash}`);
    } catch (e) {
        console.error(`❌ Failed: ${e.message}`);
    }
}

rebalance();
