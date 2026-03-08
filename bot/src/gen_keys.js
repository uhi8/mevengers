const { generatePrivateKey, privateKeyToAccount } = require("viem/accounts");

function create() {
    const aliceKey = generatePrivateKey();
    const bobKey = generatePrivateKey();

    console.log("--- NEW SECURE DEMO KEYS ---");
    console.log(`ALICE_PRIVATE_KEY=${aliceKey}`);
    console.log(`ALICE_ADDRESS=${privateKeyToAccount(aliceKey).address}`);
    console.log(`BOB_PRIVATE_KEY=${bobKey}`);
    console.log(`BOB_ADDRESS=${privateKeyToAccount(bobKey).address}`);
}

create();
