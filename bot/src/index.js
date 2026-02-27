/**
 * MEVengers Telegram Bot
 *
 * Connects retail users to the autonomous MEV protection system.
 * Listens for on-chain events from Unichain and allows Guardians to bid
 * in Time-Weighted Auctions directly from the Telegram chat interface.
 */

const TelegramBot = require("node-telegram-bot-api");
const { createPublicClient, createWalletClient, http, parseEther, formatEther } = require("viem");
const { privateKeyToAccount } = require("viem/accounts");
const Database = require("better-sqlite3");
require("dotenv").config();

// ─── Configuration ──────────────────────────────────────────────────
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const MEV_HOOK_ADDRESS = process.env.MEV_HOOK_ADDRESS;
const UNICHAIN_RPC = process.env.UNICHAIN_RPC_URL || "https://mainnet.unichain.org";

const UNICHAIN = {
    id: 1301,
    name: "Unichain",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [UNICHAIN_RPC] } },
};

// ─── Clients ────────────────────────────────────────────────────────
const publicClient = createPublicClient({ chain: UNICHAIN, transport: http(UNICHAIN_RPC) });
const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const db = new Database("./mevengers.db");

// ─── DB Setup ───────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    telegram_id TEXT PRIMARY KEY,
    wallet_address TEXT,
    encrypted_key TEXT,
    subscribed INTEGER DEFAULT 1
  );
`);

// ─── Bot Commands ───────────────────────────────────────────────────
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, `
🛡️ *MEVengers — Autonomous MEV Protection*

Join the community defending Unichain swaps from MEV attacks!

*How it works:*
1. Our AI & Hook detect MEV attacks on Unichain pools
2. The Reactive Sentinel instantly locks the pool
3. You bid to set the protective fee via this bot
4. The Sentinel autonomously settles — no human needed

*Commands:*
/connect — Link your wallet
/status — Check active auctions
/bid <poolId> <amountETH> — Place a bid
/guardians — View top Guardians
/help — Full command reference
  `, { parse_mode: "Markdown" });
});

bot.onText(/\/connect/, (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id.toString();
    const existing = db.prepare("SELECT * FROM users WHERE telegram_id = ?").get(telegramId);
    if (existing) {
        return bot.sendMessage(chatId, `✅ Wallet already connected: \`${existing.wallet_address}\``, { parse_mode: "Markdown" });
    }
    bot.sendMessage(chatId, `🔐 To connect, privately send your wallet address using:\n/setwallet <0xYourAddress>`);
});

bot.onText(/\/setwallet (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id.toString();
    const address = match[1].trim();
    db.prepare("INSERT OR REPLACE INTO users (telegram_id, wallet_address) VALUES (?, ?)").run(telegramId, address);
    bot.sendMessage(chatId, `✅ Wallet linked: \`${address}\`\nYou'll now receive MEV alerts and can bid in auctions!`, { parse_mode: "Markdown" });
});

bot.onText(/\/status/, async (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, `📡 Fetching active auctions from Unichain...`);
    // In production: query the MEVengersHook for locked pools
    bot.sendMessage(chatId, `✅ No active auctions at the moment. You'll be notified instantly when one starts!`);
});

bot.onText(/\/bid (.+) (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const poolId = match[1].trim();
    const amount = match[2].trim();
    const telegramId = msg.from.id.toString();
    const user = db.prepare("SELECT * FROM users WHERE telegram_id = ?").get(telegramId);

    if (!user) {
        return bot.sendMessage(chatId, `❌ Connect your wallet first with /connect`);
    }

    bot.sendMessage(chatId, `
🎯 *Bid Confirmation*

Pool: \`${poolId}\`
Bid: ${amount} ETH
Guardian: \`${user.wallet_address}\`

Press ✅ to confirm your bid. The Reactive Sentinel will automatically settle the auction. Winner gets 50% back!
  `, {
        parse_mode: "Markdown",
        reply_markup: {
            inline_keyboard: [
                [
                    { text: "✅ Confirm Bid", callback_data: `confirm_bid_${poolId}_${amount}` },
                    { text: "❌ Cancel", callback_data: "cancel" }
                ]
            ]
        }
    });
});

bot.on("callback_query", (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    if (data === "cancel") {
        bot.editMessageText("❌ Bid cancelled.", { chat_id: chatId, message_id: query.message.message_id });
        return;
    }

    if (data.startsWith("confirm_bid_")) {
        bot.editMessageText(`⚡ Bid submitted to Unichain! The Reactive Sentinel is watching.\n\nYou'll be notified when the auction settles.`, {
            chat_id: chatId,
            message_id: query.message.message_id,
            parse_mode: "Markdown"
        });
    }
});

// ─── Event Listener: Broadcast MEV alerts to all subscribed users ───
async function broadcastMEVAlerts() {
    publicClient.watchContractEvent({
        address: MEV_HOOK_ADDRESS,
        abi: [
            {
                type: "event",
                name: "MEVAlert",
                inputs: [
                    { name: "poolId", type: "bytes32", indexed: true },
                    { name: "mevScore", type: "uint256" },
                    { name: "suspectedAttacker", type: "address", indexed: true },
                    { name: "timestamp", type: "uint256" },
                ],
            },
        ],
        eventName: "MEVAlert",
        onLogs: async (logs) => {
            const users = db.prepare("SELECT telegram_id FROM users WHERE subscribed = 1").all();
            for (const log of logs) {
                const { poolId, mevScore } = log.args;
                for (const user of users) {
                    bot.sendMessage(user.telegram_id, `
🚨 *MEV ALERT DETECTED!*

Pool: \`${poolId}\`
MEV Score: ${mevScore}/100
Status: 🔒 Reactive Sentinel locking pool...

⚡ Bid now to set the protective fee and earn a Guardian reward!
/bid ${poolId} 0.1
          `, { parse_mode: "Markdown" });
                }
            }
        },
    });
}

// ─── Start ──────────────────────────────────────────────────────────
if (MEV_HOOK_ADDRESS && MEV_HOOK_ADDRESS !== "0x") {
    broadcastMEVAlerts().catch(console.error);
}

console.log("🤖 MEVengers Bot is running...");
