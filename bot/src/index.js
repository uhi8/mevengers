/**
 * MEVengers Telegram Bot (ethdelhi architecture)
 * 
 * restructures the bot to use the class-based monitor/query pattern from ethdelhi.
 */

const TelegramBot = require("node-telegram-bot-api");
const { createPublicClient, createWalletClient, http, parseEther, formatEther, isAddress } = require("viem");
const { privateKeyToAccount } = require("viem/accounts");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

// ─── Configuration ──────────────────────────────────────────────────
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const MEV_HOOK_ADDRESS = process.env.MEV_HOOK_ADDRESS;
const UNICHAIN_RPC = process.env.UNICHAIN_SEPOLIA_RPC_URL || "https://sepolia.unichain.org";

const UNICHAIN = {
    id: 1301,
    name: "Unichain Sepolia",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [UNICHAIN_RPC] } },
};

// ─── Constants from monitoring.ts ───
const HOOK_ABI = [
    {
        type: 'event',
        name: 'MEVAlert',
        inputs: [
            { name: 'poolId', type: 'bytes32', indexed: true },
            { name: 'mevScore', type: 'uint256' },
            { name: 'suspectedAttacker', type: 'address', indexed: true },
            { name: 'timestamp', type: 'uint256' }
        ]
    },
    {
        type: 'event',
        name: 'PoolLocked',
        inputs: [
            { name: 'poolId', type: 'bytes32', indexed: true },
            { name: 'auctionEnd', type: 'uint256' }
        ]
    },
    {
        type: 'event',
        name: 'BidPlaced',
        inputs: [
            { name: 'poolId', type: 'bytes32', indexed: true },
            { name: 'bidder', type: 'address', indexed: true },
            { name: 'amount', type: 'uint256' }
        ]
    },
    {
        type: 'event',
        name: 'AuctionSettled',
        inputs: [
            { name: 'poolId', type: 'bytes32', indexed: true },
            { name: 'winner', type: 'address', indexed: true },
            { name: 'winningFee', type: 'uint24' },
            { name: 'insurancePaid', type: 'uint256' }
        ]
    },
    {
        type: 'function',
        name: 'placeBid',
        inputs: [
            { name: 'poolId', type: 'bytes32' },
            { name: 'feeBps', type: 'uint24' }
        ],
        outputs: [],
        stateMutability: 'payable'
    },
    {
        type: 'function',
        name: 'auctions',
        inputs: [{ name: 'poolId', type: 'bytes32' }],
        outputs: [
            { name: 'locked', type: 'bool' },
            { name: 'auctionStart', type: 'uint256' },
            { name: 'auctionEnd', type: 'uint256' },
            { name: 'highestBidder', type: 'address' },
            { name: 'highestBid', type: 'uint256' },
            { name: 'insuranceFund', type: 'uint256' }
        ],
        stateMutability: 'view'
    }
];

// ─── Database Strategy ──────────────────────────────────────────────
const DB_PATH = path.resolve(__dirname, "../mevengers_db.json");
function loadDB() {
    if (!fs.existsSync(DB_PATH)) {
        fs.writeFileSync(DB_PATH, JSON.stringify({ users: {}, assignments: { ALICE: null, BOB: null } }));
    }
    const data = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
    if (!data.assignments) data.assignments = { ALICE: null, BOB: null };
    return data;
}
function saveDB(data) { fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2)); }

// ─── Blockchain Monitor Class ───
class BlockchainMonitor {
    constructor(publicClient, hookAddress, bot) {
        this.publicClient = publicClient;
        this.hookAddress = hookAddress;
        this.bot = bot;
        this.activeAuctions = new Map();
    }

    getShortId(poolId) {
        const shortId = poolId.substring(0, 10);
        this.activeAuctions.set(shortId, poolId);
        return shortId;
    }

    startMonitoring() {
        console.log("🔍 Starting MEVengers blockchain event monitoring...");
        console.log(`📡 Monitoring Hook: ${this.hookAddress}`);

        // 1. MEV Alerts
        this.publicClient.watchContractEvent({
            address: this.hookAddress,
            abi: HOOK_ABI,
            eventName: 'MEVAlert',
            onLogs: (logs) => {
                console.log(`📝 Received ${logs.length} MEVAlert logs`);
                logs.forEach(log => this.handleMEVAlert(log.args));
            },
            onError: (err) => console.error("❌ MEVAlert Watch Error:", err)
        });

        // 2. Pool Locked
        this.publicClient.watchContractEvent({
            address: this.hookAddress,
            abi: HOOK_ABI,
            eventName: 'PoolLocked',
            onLogs: (logs) => {
                console.log(`📝 Received ${logs.length} PoolLocked logs`);
                logs.forEach(log => this.handlePoolLocked(log.args));
            },
            onError: (err) => console.error("❌ PoolLocked Watch Error:", err)
        });

        // 3. Auction Settled
        this.publicClient.watchContractEvent({
            address: this.hookAddress,
            abi: HOOK_ABI,
            eventName: 'AuctionSettled',
            onLogs: (logs) => {
                console.log(`📝 Received ${logs.length} AuctionSettled logs`);
                logs.forEach(log => this.handleAuctionSettled(log.args));
            },
            onError: (err) => console.error("❌ AuctionSettled Watch Error:", err)
        });
    }

    async handleMEVAlert(args) {
        const { poolId, mevScore } = args;
        const shortId = this.getShortId(poolId);
        console.log(`🚨 MEV Alert: Pool ${poolId}, Score ${mevScore}`);
        this.broadcastToUsers(`
🚨 **MEV ALERT DETECTED!**

Pool: \`${poolId}\`
MEV Score: **${mevScore}/100**
Status: 🔒 Reactive Sentinel locking pool...

⚡ *Guardian Action:* Bid now to earn rewards!
        `, shortId);
    }

    async handlePoolLocked(args) {
        const { poolId } = args;
        const shortId = this.getShortId(poolId);
        console.log(`🔒 Pool Locked: ${poolId}`);
        this.broadcastToUsers(`
🔒 **POOL LOCKED BY SENTINEL!**

Pool: \`${poolId}\`
Status: 🛡️ Auction is LIVE.

⚡ *Guardian Action:* Place your protective bid now!
        `, shortId);
    }

    async handleAuctionSettled(args) {
        const { poolId, winner, insurancePaid } = args;
        console.log(`🏁 Auction Settled: Pool ${poolId}, Winner ${winner}`);

        const data = loadDB();
        const user = Object.values(data.users).find(u => u.wallet_address.toLowerCase() === winner.toLowerCase());

        if (user) {
            this.bot.sendMessage(user.telegram_id, `
🏆 **AUCTION SETTLED: YOU WON!**

You successfully defended Pool \`${poolId.substring(0, 10)}...\`!
💰 Insurance distributed: ${formatEther(insurancePaid)} ETH
⭐ Reputation gained: +10
            `, { parse_mode: 'Markdown' });
        } else {
            this.broadcastToUsers(`✅ **Pool Secured:** \`${poolId.substring(0, 10)}...\` unlocked. Attack neutralized.`);
        }
    }

    broadcastToUsers(text, shortId) {
        const data = loadDB();
        const users = Object.values(data.users).filter(u => u.subscribed === 1);
        users.forEach(u => {
            const opts = { parse_mode: 'Markdown' };
            if (shortId) {
                opts.reply_markup = {
                    inline_keyboard: [[{ text: "🎯 Quick Bid (0.0005 ETH, 0.3% fee)", callback_data: `confirm_bid_${shortId}_0.0005_3000` }]]
                };
            }
            this.bot.sendMessage(u.telegram_id, text, opts);
        });
    }
}

// ─── Contract Queries Class ───
class ContractQueries {
    constructor(publicClient, hookAddress) {
        this.publicClient = publicClient;
        this.hookAddress = hookAddress;
    }

    async getAuction(poolId) {
        try {
            return await this.publicClient.readContract({
                address: this.hookAddress,
                abi: HOOK_ABI,
                functionName: 'auctions',
                args: [poolId]
            });
        } catch (e) { return null; }
    }

    async placeBid(privateKey, poolId, ethAmount, feeBps = 3000) {
        const account = privateKeyToAccount(privateKey);
        const walletClient = createWalletClient({ account, chain: UNICHAIN, transport: http(UNICHAIN_RPC) });

        console.log(`  🔬 Simulating bid for ${account.address}...`);
        const { request } = await this.publicClient.simulateContract({
            account,
            address: this.hookAddress,
            abi: HOOK_ABI,
            functionName: 'placeBid',
            args: [poolId, feeBps],
            value: parseEther(ethAmount)
        });

        console.log(`  📡 Broadcasting tx...`);
        const hash = await walletClient.writeContract(request);
        return hash;
    }
}

// ─── Main Bot Logic ───
const publicClient = createPublicClient({ chain: UNICHAIN, transport: http(UNICHAIN_RPC) });
const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const monitor = new BlockchainMonitor(publicClient, MEV_HOOK_ADDRESS, bot);
const queries = new ContractQueries(publicClient, MEV_HOOK_ADDRESS);

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, `
🛡️ **MEVengers Bot** (ethdelhi architecture)

I monitor Uniswap V4 pools for MEV and help you defend them!

📱 **Commands:**
/connect - Connect your Guardian persona
/balance - Check your persona's balance
/help - Show this message

🚀 **Get started:** /connect
    `, { parse_mode: 'Markdown' });
});

bot.onText(/\/connect/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id.toString();
    const data = loadDB();

    if (data.users[telegramId]) {
        return bot.sendMessage(chatId, `✅ Wallet already connected: \`${data.users[telegramId].wallet_address}\` (*Persona: ${data.users[telegramId].persona}*)`, { parse_mode: 'Markdown' });
    }

    let persona, pk;
    if (!data.assignments.ALICE) {
        persona = "ALICE";
        pk = process.env.ALICE_PRIVATE_KEY;
        data.assignments.ALICE = telegramId;
    } else if (!data.assignments.BOB) {
        persona = "BOB";
        pk = process.env.BOB_PRIVATE_KEY;
        data.assignments.BOB = telegramId;
    } else {
        return bot.sendMessage(chatId, "❌ No more demo personas available.");
    }

    const account = privateKeyToAccount(pk);
    data.users[telegramId] = { telegram_id: telegramId, wallet_address: account.address, privateKey: pk, persona, subscribed: 1 };
    saveDB(data);

    bot.sendMessage(chatId, `
🔐 **Wallet Connected!**
👤 Persona: *${persona}*
💰 Address: \`${account.address}\`

I will now notify you of real-time MEV alerts!
    `, { parse_mode: 'Markdown' });
});

bot.onText(/\/balance/, async (msg) => {
    const data = loadDB();
    const user = data.users[msg.from.id.toString()];
    if (!user) return bot.sendMessage(msg.chat.id, "❌ Run /connect first!");
    const balance = await publicClient.getBalance({ address: user.wallet_address });
    bot.sendMessage(msg.chat.id, `💰 **${user.persona} Balance:** ${formatEther(balance)} ETH`, { parse_mode: 'Markdown' });
});

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const telegramId = query.from.id.toString();
    const data = query.data;
    const db = loadDB();
    const user = db.users[telegramId];

    console.log(`🔹 Button Click: ${data} from ${user ? user.persona : 'Unknown'}`);

    if (data.startsWith("confirm_bid_")) {
        if (!user) return bot.answerCallbackQuery(query.id, { text: "❌ Run /connect first!", show_alert: true });

        const [, , shortId, amount, fee] = data.split("_");
        const poolId = monitor.activeAuctions.get(shortId);

        if (!poolId) return bot.editMessageText("❌ Auction session expired.", { chat_id: chatId, message_id: query.message.message_id });

        console.log(`⏳ Submitting bid for ${user.persona} on pool ${poolId} (Fee: ${fee / 100}%)...`);
        bot.editMessageText(`⏳ **Submitting bid for ${user.persona}...**`, { chat_id: chatId, message_id: query.message.message_id });

        try {
            const hash = await queries.placeBid(user.privateKey, poolId, amount, parseInt(fee));
            console.log(`✅ Bid Successful: ${hash}`);
            bot.editMessageText(`
✅ **Bid Submitted!**
Persona: *${user.persona}*
Hash: \`${hash}\`
🔗 [Explorer](https://sepolia.uniscan.xyz/tx/${hash})
            `, { chat_id: chatId, message_id: query.message.message_id, parse_mode: 'Markdown', disable_web_page_preview: true });
        } catch (e) {
            bot.editMessageText(`❌ **Failed:** ${e.shortMessage || e.message}`, { chat_id: chatId, message_id: query.message.message_id });
        }
    }
});

monitor.startMonitoring();
console.log("🤖 MEVengers Bot is running...");
setInterval(() => console.log("💓 Heartbeat..."), 60000);
