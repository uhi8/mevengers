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
            { name: 'amount', type: 'uint256' },
            { name: 'fee', type: 'uint24' }
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
            { name: 'winningFee', type: 'uint24' }
        ],
        stateMutability: 'view'
    },
    {
        type: 'function',
        name: 'settleAuctionAndUnlock',
        inputs: [
            { name: 'poolId', type: 'bytes32' },
            { name: 'winningFeeBps', type: 'uint24' }
        ],
        outputs: [],
        stateMutability: 'nonpayable'
    }
];

// ─── Database Strategy ──────────────────────────────────────────────
const DB_PATH = path.resolve(__dirname, "../mevengers_db.json");
const BOT_LOCK_PATH = path.resolve(__dirname, "../.bot.lock");
function loadDB() {
    if (!fs.existsSync(DB_PATH)) {
        fs.writeFileSync(DB_PATH, JSON.stringify({ users: {}, assignments: { ALICE: null, BOB: null } }));
    }
    const data = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
    if (!data.assignments) data.assignments = { ALICE: null, BOB: null };
    return data;
}
function saveDB(data) { fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2)); }

function isProcessRunning(pid) {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

function acquireBotLock() {
    if (fs.existsSync(BOT_LOCK_PATH)) {
        const existingPid = parseInt(fs.readFileSync(BOT_LOCK_PATH, "utf8"), 10);
        if (Number.isInteger(existingPid) && existingPid !== process.pid && isProcessRunning(existingPid)) {
            throw new Error(`Another bot instance is already running (PID ${existingPid}). Stop it before starting a new one.`);
        }

        try { fs.unlinkSync(BOT_LOCK_PATH); } catch {}
    }

    fs.writeFileSync(BOT_LOCK_PATH, String(process.pid));

    const cleanup = () => {
        try {
            if (!fs.existsSync(BOT_LOCK_PATH)) return;
            const lockPid = parseInt(fs.readFileSync(BOT_LOCK_PATH, "utf8"), 10);
            if (lockPid === process.pid) fs.unlinkSync(BOT_LOCK_PATH);
        } catch {}
    };

    process.on("exit", cleanup);
    process.on("SIGINT", () => { cleanup(); process.exit(0); });
    process.on("SIGTERM", () => { cleanup(); process.exit(0); });
}

// ─── Blockchain Monitor Class ───
class BlockchainMonitor {
    constructor(publicClient, hookAddress, bot, settlementClient) {
        this.publicClient = publicClient;
        this.hookAddress = hookAddress;
        this.bot = bot;
        this.settlementClient = settlementClient;
        this.activeAuctions = new Map();
        this.settlementTimers = new Map();
    }

    getShortId(poolId) {
        const shortId = poolId.substring(0, 10);
        this.activeAuctions.set(shortId, poolId);
        return shortId;
    }

    startMonitoring() {
        console.log("🔍 Starting MEVengers blockchain event monitoring...");
        console.log(`📡 Monitoring Hook: ${this.hookAddress}`);

        // Listen to all events on the contract to reduce RPC load
        this.publicClient.watchContractEvent({
            address: this.hookAddress,
            abi: HOOK_ABI,
            onLogs: (logs) => {
                logs.forEach(log => {
                    if (log.eventName === 'MEVAlert') {
                        console.log(`📝 Received MEVAlert log`);
                        this.handleMEVAlert(log.args);
                    } else if (log.eventName === 'PoolLocked') {
                        console.log(`📝 Received PoolLocked log`);
                        this.handlePoolLocked(log.args);
                    } else if (log.eventName === 'AuctionSettled') {
                        console.log(`📝 Received AuctionSettled log`);
                        this.handleAuctionSettled(log.args);
                    }
                });
            },
            onError: (err) => console.error("❌ Watch Error:", err)
        });
    }

    async handleMEVAlert(args) {
        const { poolId, mevScore } = args;
        const shortId = this.getShortId(poolId);
        console.log(`🚨 MEV Alert: Pool ${poolId}, Score ${mevScore}`);

        // Read AI Insights if available
        let aiInsight = "";
        try {
            const insightsPath = path.resolve(__dirname, "../../mev_insights.json");
            if (fs.existsSync(insightsPath)) {
                const insights = JSON.parse(fs.readFileSync(insightsPath, "utf8"));
                if (insights[poolId]) {
                    const aiScore = insights[poolId].score;
                    const rec = insights[poolId].recommendation;
                    aiInsight = `\n🧠 **AI Confidence:** \`${aiScore}/100\`\n🤖 **Recommendation:** \`${rec}\``;
                }
            }
        } catch (e) {
            console.error("❌ Failed to read AI insights:", e.message);
        }

        this.broadcastToUsers(`
🚨 **MEV ALERT DETECTED!**

Pool: \`${poolId}\`
On-chain Score: **${mevScore}/100**${aiInsight}
Status: 🔒 Reactive Sentinel locking pool...

⚡ *Guardian Action:* Bid now to earn rewards!
        `, shortId);
    }

    async handlePoolLocked(args) {
        const { poolId, auctionEnd } = args;
        const shortId = this.getShortId(poolId);
        console.log(`🔒 Pool Locked: ${poolId}`);
        this.broadcastToUsers(`
🔒 **POOL LOCKED BY SENTINEL!**

Pool: \`${poolId}\`
Status: 🛡️ Auction is LIVE.

⚡ *Guardian Action:* Place your protective bid now!
        `, shortId);

    this.scheduleFallbackSettlement(poolId, auctionEnd);
    }

    async handleAuctionSettled(args) {
        const { poolId, winner, insurancePaid } = args;
        console.log(`🏁 Auction Settled: Pool ${poolId}, Winner ${winner}`);
        this.clearSettlementTimer(poolId);

        const data = loadDB();
        const users = Object.values(data.users).filter(u => u.subscribed === 1);
        const winnerUser = users.find(u => u.wallet_address.toLowerCase() === winner.toLowerCase());
        const winnerLabel = winnerUser
            ? `${winnerUser.persona} (\`${winnerUser.wallet_address}\`)`
            : `\`${winner}\``;

        users.forEach((user) => {
            const isWinner = user.wallet_address.toLowerCase() === winner.toLowerCase();

            if (isWinner) {
                this.bot.sendMessage(user.telegram_id, `
🏆 **AUCTION SETTLED: YOU WON!**

You successfully defended Pool \`${poolId.substring(0, 10)}...\`!
💰 Insurance distributed: ${formatEther(insurancePaid)} ETH
⭐ Reputation gained: +10
                `, { parse_mode: 'Markdown' });
                return;
            }

            this.bot.sendMessage(user.telegram_id, `
✅ **AUCTION SETTLED**

Pool: \`${poolId.substring(0, 10)}...\`
Winner: ${winnerLabel}
Insurance distributed: ${formatEther(insurancePaid)} ETH

Better luck next round ⚡
            `, { parse_mode: 'Markdown' });
        });
    }

    broadcastToUsers(text, shortId) {
        const data = loadDB();
        const users = Object.values(data.users).filter(u => u.subscribed === 1);
        users.forEach(u => {
            const opts = { parse_mode: 'Markdown' };
            if (shortId) {
                opts.reply_markup = {
                    inline_keyboard: [[{ text: "🎯 Quick Bid (0.0000001 ETH, 0.3% fee)", callback_data: `confirm_bid_${shortId}_0.0000001_3000` }]]
                };
            }
            this.bot.sendMessage(u.telegram_id, text, opts);
        });
    }

    clearSettlementTimer(poolId) {
        const key = poolId.toLowerCase();
        const timer = this.settlementTimers.get(key);
        if (timer) {
            clearTimeout(timer);
            this.settlementTimers.delete(key);
        }
    }

    scheduleFallbackSettlement(poolId, auctionEnd) {
        if (!this.settlementClient) return;

        const now = Math.floor(Date.now() / 1000);
        const endTs = Number(auctionEnd || 0n);
        const delayMs = Math.max(5000, (endTs - now) * 1000 + 5000);

        this.clearSettlementTimer(poolId);
        console.log(`⏱️ Fallback settlement scheduled for ${poolId} in ~${Math.ceil(delayMs / 1000)}s`);

        const timer = setTimeout(async () => {
            await this.runFallbackSettlement(poolId);
        }, delayMs);

        this.settlementTimers.set(poolId.toLowerCase(), timer);
    }

    async runFallbackSettlement(poolId) {
        if (!this.settlementClient) return;

        try {
            const auction = await this.publicClient.readContract({
                address: this.hookAddress,
                abi: HOOK_ABI,
                functionName: 'auctions',
                args: [poolId]
            });

            const locked = auction.locked ?? auction[0];
            const auctionEnd = Number(auction.auctionEnd ?? auction[2] ?? 0n);
            const winningFee = Number(auction.winningFee ?? auction[5] ?? 3000);
            const now = Math.floor(Date.now() / 1000);

            if (!locked) {
                console.log(`✅ Auction already settled: ${poolId}`);
                this.clearSettlementTimer(poolId);
                return;
            }

            if (now < auctionEnd) {
                console.log(`⏳ Auction still active for ${poolId}. Rescheduling fallback settle.`);
                this.scheduleFallbackSettlement(poolId, BigInt(auctionEnd));
                return;
            }

            console.log(`🚨 Running fallback settle for ${poolId} (fee=${winningFee})...`);
            const txHash = await this.settlementClient.writeContract({
                address: this.hookAddress,
                abi: HOOK_ABI,
                functionName: 'settleAuctionAndUnlock',
                args: [poolId, winningFee]
            });
            console.log(`🏁 Fallback settlement submitted: ${txHash}`);
            this.clearSettlementTimer(poolId);
        } catch (e) {
            console.error(`❌ Fallback settlement failed for ${poolId}:`, e.shortMessage || e.message);
            this.scheduleFallbackSettlement(poolId, BigInt(Math.floor(Date.now() / 1000) + 15));
        }
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
if (!BOT_TOKEN || !MEV_HOOK_ADDRESS) {
    console.error("❌ Missing TELEGRAM_BOT_TOKEN or MEV_HOOK_ADDRESS in .env");
    process.exit(1);
}

try {
    acquireBotLock();
} catch (e) {
    console.error(`❌ ${e.message}`);
    process.exit(1);
}

const settlementClient = process.env.DEPLOYER_PRIVATE_KEY
    ? createWalletClient({
        account: privateKeyToAccount(process.env.DEPLOYER_PRIVATE_KEY),
        chain: UNICHAIN,
        transport: http(UNICHAIN_RPC)
    })
    : null;
const bot = new TelegramBot(BOT_TOKEN, { polling: true });
bot.on('polling_error', (err) => {
    const msg = err?.message || String(err);
    if (msg.includes('409 Conflict')) {
        console.error('❌ Telegram polling conflict detected (409). Only one bot instance can run. Exiting this process.');
        process.exit(1);
    }
    console.error('❌ Telegram polling error:', msg);
});

const monitor = new BlockchainMonitor(publicClient, MEV_HOOK_ADDRESS, bot, settlementClient);
const queries = new ContractQueries(publicClient, MEV_HOOK_ADDRESS);

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, `
🛡️ **MEVengers Bot** (ethdelhi architecture)

I monitor Uniswap V4 pools for MEV and help you defend them!

📱 **Commands:**
/connect - Connect your Guardian persona
/balance - Check your persona's balance
/status [poolId|shortId] - Check auction status
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

bot.onText(/\/status(?:\s+(.+))?/, async (msg, match) => {
    const rawArg = (match && match[1] ? match[1] : "").trim();

    let poolId = null;
    let shortId = null;

    if (!rawArg) {
        const entries = Array.from(monitor.activeAuctions.entries());
        if (entries.length === 0) {
            return bot.sendMessage(msg.chat.id, "ℹ️ No tracked auctions yet. Trigger one first, then run /status <shortId>.");
        }

        const latest = entries[entries.length - 1];
        shortId = latest[0];
        poolId = latest[1];
    } else if (monitor.activeAuctions.has(rawArg)) {
        shortId = rawArg;
        poolId = monitor.activeAuctions.get(rawArg);
    } else if (/^0x[0-9a-fA-F]{64}$/.test(rawArg)) {
        poolId = rawArg;
        shortId = rawArg.substring(0, 10);
    } else {
        const known = Array.from(monitor.activeAuctions.keys()).slice(-5);
        return bot.sendMessage(
            msg.chat.id,
            `❌ Unknown pool id/short id: ${rawArg}\n\nTry: /status (latest) or /status 0x1234abcd...\nKnown short ids: ${known.length ? known.join(', ') : 'none yet'}`
        );
    }

    try {
        const auction = await queries.getAuction(poolId);
        if (!auction) {
            return bot.sendMessage(msg.chat.id, `❌ Could not fetch auction for ${poolId}`);
        }

        const locked = auction.locked ?? auction[0];
        const auctionStart = Number(auction.auctionStart ?? auction[1] ?? 0n);
        const auctionEnd = Number(auction.auctionEnd ?? auction[2] ?? 0n);
        const highestBidder = auction.highestBidder ?? auction[3];
        const highestBid = auction.highestBid ?? auction[4] ?? 0n;
        const winningFee = Number(auction.winningFee ?? auction[5] ?? 0);
        const now = Math.floor(Date.now() / 1000);
        const remaining = Math.max(0, auctionEnd - now);
        const isZeroAddress = highestBidder.toLowerCase() === '0x0000000000000000000000000000000000000000';

        const text = `
📊 **Auction Status**

Pool: \`${poolId}\`
Short ID: \`${shortId}\`
Locked: ${locked ? '✅ Yes' : '❌ No'}
Highest Bid: ${formatEther(highestBid)} ETH
Highest Bidder: ${isZeroAddress ? 'None' : `\`${highestBidder}\``}
Winning Fee: ${winningFee} bps (${(winningFee / 10000 * 100).toFixed(2)}%)
Ends In: ${remaining}s

Timestamps:
• Start: ${auctionStart}
• End: ${auctionEnd}
• Now: ${now}
        `;

        return bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });
    } catch (e) {
        return bot.sendMessage(msg.chat.id, `❌ Status error: ${e.shortMessage || e.message}`);
    }
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
            const reserveForGas = parseEther("0.00002");
            const fallbackValue = parseEther("0.0000001");

            const auction = await queries.getAuction(poolId);
            const currentHighestBid = auction
                ? (auction.highestBid ?? auction[4] ?? 0n)
                : 0n;
            const minOutbidValue = currentHighestBid + 1n;

            const balance = await publicClient.getBalance({ address: user.wallet_address });
            if (balance <= reserveForGas) {
                throw new Error(`Insufficient ETH for gas. Balance: ${formatEther(balance)} ETH`);
            }

            let bidValue = parseEther(amount);
            if (bidValue < minOutbidValue) {
                bidValue = minOutbidValue;
            }

            if (balance < bidValue + reserveForGas) {
                const maxAffordable = balance - reserveForGas;
                if (maxAffordable <= currentHighestBid) {
                    throw new Error(
                        `Bid too low for current auction. Highest bid is ${formatEther(currentHighestBid)} ETH. ` +
                        `Balance: ${formatEther(balance)} ETH`
                    );
                }

                if (fallbackValue >= minOutbidValue && balance >= fallbackValue + reserveForGas) {
                    bidValue = fallbackValue;
                } else {
                    bidValue = maxAffordable;
                }

                console.log(`⚠️ Adjusted bid for ${user.persona} to ${formatEther(bidValue)} ETH due to balance/auction constraints (${formatEther(balance)} ETH).`);
            }

            if (bidValue <= currentHighestBid) {
                throw new Error(`Bid too low. Current highest bid is ${formatEther(currentHighestBid)} ETH`);
            }

            const bidAmount = formatEther(bidValue);
            const hash = await queries.placeBid(user.privateKey, poolId, bidAmount, parseInt(fee));
            console.log(`✅ Bid Successful: ${hash}`);
            bot.editMessageText(`
✅ **Bid Submitted!**
Persona: *${user.persona}*
Hash: \`${hash}\`
🔗 [Explorer](https://sepolia.uniscan.xyz/tx/${hash})
            `, { chat_id: chatId, message_id: query.message.message_id, parse_mode: 'Markdown', disable_web_page_preview: true });
        } catch (e) {
            const rawError = `${e?.shortMessage || ''} ${e?.message || ''}`;
            const userError = rawError.includes('0xa0d26eb6')
                ? 'Bid too low. Another bid is already higher. Tap Quick Bid again to auto-outbid.'
                : (e.shortMessage || e.message);
            bot.editMessageText(`❌ **Failed:** ${userError}`, { chat_id: chatId, message_id: query.message.message_id });
        }
    }
});

monitor.startMonitoring();
console.log("🤖 MEVengers Bot is running...");
setInterval(() => console.log("💓 Heartbeat..."), 60000);
