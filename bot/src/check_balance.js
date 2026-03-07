const { createPublicClient, http, formatEther } = require("viem");
const { privateKeyToAccount } = require("viem/accounts");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

const UNICHAIN_RPC = process.env.UNICHAIN_SEPOLIA_RPC_URL || "https://sepolia.unichain.org";
const client = createPublicClient({ transport: http(UNICHAIN_RPC) });

async function check() {
    const keys = {
        DEPLOYER: process.env.DEPLOYER_PRIVATE_KEY,
        ALICE: process.env.ALICE_PRIVATE_KEY,
        BOB: process.env.BOB_PRIVATE_KEY
    };

    for (const [name, key] of Object.entries(keys)) {
        if (!key) continue;
        const account = privateKeyToAccount(key);
        const balance = await client.getBalance({ address: account.address });
        console.log(`${name}: ${account.address} - ${formatEther(balance)} ETH`);
    }
}

check();
