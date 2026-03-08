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
const deployerAccount = privateKeyToAccount(process.env.DEPLOYER_PRIVATE_KEY);
const walletClient = createWalletClient({
    account: deployerAccount,
    chain: UNICHAIN,
    transport: http(UNICHAIN_RPC)
});

async function fund() {
    const alice = privateKeyToAccount(process.env.ALICE_PRIVATE_KEY).address;
    const bob = privateKeyToAccount(process.env.BOB_PRIVATE_KEY).address;

    console.log(`📡 Current Deployer Balance: ${formatEther(await publicClient.getBalance({ address: deployerAccount.address }))} ETH`);

    const recipients = [alice, bob];

    for (const to of recipients) {
        const balance = await publicClient.getBalance({ address: to });
        if (balance < parseEther("0.001")) {
            console.log(`💸 Funding ${to} (Current: ${formatEther(balance)})...`);
            try {
                const hash = await walletClient.sendTransaction({
                    to,
                    value: parseEther("0.001")
                });
                console.log(`✅ Sent! Hash: ${hash}`);
            } catch (e) {
                console.error(`❌ Failed: ${e.message}`);
            }
        } else {
            console.log(`✅ ${to} already has ${formatEther(balance)} ETH`);
        }
    }

    console.log("--- FINAL BALANCES ---");
    console.log(`ALICE: ${formatEther(await publicClient.getBalance({ address: alice }))} ETH`);
    console.log(`BOB: ${formatEther(await publicClient.getBalance({ address: bob }))} ETH`);
}

fund();
