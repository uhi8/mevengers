const { createPublicClient, http, formatEther } = require("viem");
const TelegramBot = require("node-telegram-bot-api");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

const UNICHAIN_RPC = process.env.UNICHAIN_SEPOLIA_RPC_URL || "https://sepolia.unichain.org";
const HOOK_ADDRESS = process.env.MEV_HOOK_ADDRESS;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

async function diagnose() {
    console.log("🛠️ Starting Bot Diagnosis...");

    // 1. Test RPC
    const client = createPublicClient({ transport: http(UNICHAIN_RPC) });
    try {
        const blockNumber = await client.getBlockNumber();
        console.log(`✅ RPC Connected. Current Block: ${blockNumber}`);
    } catch (e) {
        console.error(`❌ RPC Connection Failed: ${e.message}`);
        return;
    }

    // 2. Test Contract
    try {
        const code = await client.getBytecode({ address: HOOK_ADDRESS });
        if (code && code !== '0x') {
            console.log(`✅ Hook Contract found at ${HOOK_ADDRESS}`);
        } else {
            console.error(`❌ No contract code at ${HOOK_ADDRESS}. Check your .env!`);
        }
    } catch (e) {
        console.error(`❌ Contract Check Failed: ${e.message}`);
    }

    // 3. Test Bot Token
    const bot = new TelegramBot(BOT_TOKEN);
    try {
        const me = await bot.getMe();
        console.log(`✅ Bot Authenticated: @${me.username}`);
    } catch (e) {
        console.error(`❌ Bot Token Invalid: ${e.message}`);
    }

    // 4. Test Database & User Communication
    const DB_PATH = path.resolve(__dirname, "../mevengers_db.json");
    if (fs.existsSync(DB_PATH)) {
        const data = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
        const users = Object.values(data.users);
        if (users.length > 0) {
            console.log(`✅ Found ${users.length} registered user(s).`);
            const firstUser = users[0];
            console.log(`📡 Attempting to send test message to user ${firstUser.telegram_id} (${firstUser.persona})...`);
            try {
                await bot.sendMessage(firstUser.telegram_id, "🔍 **MEVengers Diagnostic:** Connection confirmed!");
                console.log("✅ Diagnostic message sent successfully!");
            } catch (e) {
                console.error(`❌ Failed to send message: ${e.message}`);
                console.log("💡 Suggestion: Has the user started the bot in Telegram?");
            }
        } else {
            console.log("⚠️ No users found in database. Have you run /connect yet?");
        }
    } else {
        console.log("❌ Database file missing.");
    }

    // 5. Test specific TX if provided
    const txHash = process.argv[2];
    if (txHash) {
        console.log(`\n🔍 Investigating Transaction: ${txHash}`);
        try {
            const receipt = await client.getTransactionReceipt({ hash: txHash });
            console.log(`✅ Receipt found. Block: ${receipt.blockNumber}`);
            console.log(`Status: ${receipt.status === 'success' ? '✅ SUCCESS' : '❌ FAILED (Reverted)'}`);
            console.log(`Logs found: ${receipt.logs.length}`);

            receipt.logs.forEach((log, i) => {
                console.log(` Log ${i} Topic 0: ${log.topics[0]}`);
            });

            const poolLockedTopic = "0x89297376c96884693a1290333203923507ea6987e915019036c019038d17977a"; // keccak256("PoolLocked(bytes32,uint256)")
            const found = receipt.logs.find(l => l.topics[0] === poolLockedTopic);
            if (found) {
                console.log("✅ PoolLocked event FOUND in this transaction!");
            } else {
                console.error("❌ PoolLocked event NOT FOUND in this transaction logs.");
                console.log("💡 The trigger_mev script should have called lockPool.");
            }
        } catch (e) {
            console.error(`❌ Failed to get receipt: ${e.message}`);
        }
    }
}

diagnose();
