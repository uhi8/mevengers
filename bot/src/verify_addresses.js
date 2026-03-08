const { privateKeyToAccount } = require("viem/accounts");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

function check() {
    const keys = {
        DEPLOYER: process.env.DEPLOYER_PRIVATE_KEY,
        ALICE: process.env.ALICE_PRIVATE_KEY,
        BOB: process.env.BOB_PRIVATE_KEY
    };

    for (const [name, key] of Object.entries(keys)) {
        if (!key) {
            console.log(`${name}: KEY MISSING`);
            continue;
        }
        const account = privateKeyToAccount(key);
        console.log(`${name}: ${account.address}`);
    }
}

check();
