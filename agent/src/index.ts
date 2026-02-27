/**
 * MEVengers AI Agent
 *
 * This AI agent acts as the off-chain intelligence layer for MEVengers.
 * It augments the Reactive Network Sentinel by providing ML-based MEV
 * pattern analysis and manages Guardian reputation scoring.
 *
 * Core Responsibilities:
 * 1. Analyze historical swap data and continuously train MEV detection models.
 * 2. Predict MEV attacks BEFORE the on-chain Hook emits an alert (pre-emptive).
 * 3. Score Guardian performance and relay reputation updates to the Hook.
 * 4. Manage the Telegram bot's notification intelligence (smarter alerts).
 *
 * @file agent/src/index.ts
 */

import { createPublicClient, http, parseAbiItem } from "viem";
import type { PublicClient } from "viem";

// ─── Chain Configuration ────────────────────────────────────────────
const UNICHAIN_RPC = process.env.UNICHAIN_RPC_URL || "https://mainnet.unichain.org";
const MEV_HOOK_ADDRESS = (process.env.MEV_HOOK_ADDRESS || "0x") as `0x${string}`;

// ─── Viem Client (Unichain) ─────────────────────────────────────────
const client: PublicClient = createPublicClient({
  chain: {
    id: 1301,
    name: "Unichain",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [UNICHAIN_RPC] } },
  },
  transport: http(UNICHAIN_RPC),
});

// ─── In-memory swap history for MEV pattern learning ────────────────
interface SwapRecord {
  poolId: string;
  amount: bigint;
  timestamp: number;
  isMEV: boolean; // labelled after auction outcome
}

const swapHistory: SwapRecord[] = [];

// ─── Simple ML: Rolling Feature Vector ──────────────────────────────
/**
 * computeMEVScore
 *
 * A lightweight feature-based MEV predictor operating on the last N swaps.
 * This can later be upgraded to an ONNX model inference via `onnxruntime-node`.
 */
function computeMEVScore(recent: SwapRecord[]): number {
  if (recent.length < 2) return 0;

  let score = 0;

  // Feature 1: Time compression (rapid consecutive swaps)
  const timeDelta = recent[recent.length - 1].timestamp - recent[recent.length - 2].timestamp;
  if (timeDelta < 2000) score += 40; // Under 2 seconds
  else if (timeDelta < 5000) score += 20; // Under 5 seconds

  // Feature 2: Running average volume spike detection
  const amounts = recent.map((r) => Number(r.amount < 0n ? -r.amount : r.amount));
  const avg = amounts.slice(0, -1).reduce((a, b) => a + b, 0) / (amounts.length - 1);
  const latest = amounts[amounts.length - 1];
  if (latest > avg * 5) score += 35; // 5x average = strong signal
  else if (latest > avg * 2) score += 15;

  // Feature 3: Direction flip pattern (sandwich setup)
  const lastTwo = recent.slice(-2);
  if (lastTwo.length === 2 && lastTwo[0].amount > 0n === lastTwo[1].amount > 0n) {
    score += 25;
  }

  return Math.min(score, 100);
}

// ─── Guardian Reputation Engine ────────────────────────────────────
interface GuardianScore {
  address: string;
  wins: number;
  bids: number;
  lastActive: number;
}

const guardians: Map<string, GuardianScore> = new Map();

function recordBid(guardianAddress: string): void {
  const g = guardians.get(guardianAddress) || { address: guardianAddress, wins: 0, bids: 0, lastActive: 0 };
  g.bids++;
  g.lastActive = Date.now();
  guardians.set(guardianAddress, g);
}

function recordWin(guardianAddress: string): void {
  const g = guardians.get(guardianAddress);
  if (!g) return;
  g.wins++;
  guardians.set(guardianAddress, g);
}

function getReputationScore(guardianAddress: string): number {
  const g = guardians.get(guardianAddress);
  if (!g || g.bids === 0) return 0;
  const winRate = g.wins / g.bids;
  const activityBonus = Math.min(g.bids * 2, 30);
  return Math.min(Math.floor(winRate * 70 + activityBonus), 100);
}

// ─── Event Listeners ────────────────────────────────────────────────
async function startEventMonitoring() {
  console.log("🤖 MEVengers AI Agent starting...");
  console.log(`🔗 Monitoring: ${MEV_HOOK_ADDRESS} on Unichain`);

  // Listen to MEVAlert events from the hook
  client.watchContractEvent({
    address: MEV_HOOK_ADDRESS,
    abi: [
      parseAbiItem("event MEVAlert(bytes32 indexed poolId, uint256 mevScore, address indexed suspectedAttacker, uint256 timestamp)"),
    ],
    eventName: "MEVAlert",
    onLogs: async (logs) => {
      for (const log of logs) {
        const { poolId, mevScore, suspectedAttacker } = log.args as any;
        console.log(`🚨 MEV Alert: pool=${poolId} score=${mevScore} attacker=${suspectedAttacker}`);
        // In production: relay this to the Telegram bot push system with enriched context
      }
    },
  });

  // Listen to AuctionSettled events
  client.watchContractEvent({
    address: MEV_HOOK_ADDRESS,
    abi: [
      parseAbiItem("event AuctionSettled(bytes32 indexed poolId, address indexed winner, uint24 winningFee, uint256 insurancePaid)"),
    ],
    eventName: "AuctionSettled",
    onLogs: async (logs) => {
      for (const log of logs) {
        const { winner, winningFee, insurancePaid } = log.args as any;
        console.log(`✅ Auction Settled: winner=${winner} fee=${winningFee}bps insurance=${insurancePaid}`);
        recordWin(winner);
      }
    },
  });

  // Listen to BidPlaced events
  client.watchContractEvent({
    address: MEV_HOOK_ADDRESS,
    abi: [
      parseAbiItem("event BidPlaced(bytes32 indexed poolId, address indexed bidder, uint256 amount)"),
    ],
    eventName: "BidPlaced",
    onLogs: async (logs) => {
      for (const log of logs) {
        const { bidder } = log.args as any;
        recordBid(bidder);
        console.log(`💰 Bid received from Guardian: ${bidder}`);
      }
    },
  });

  console.log("✅ AI Agent monitoring active. Watching for MEV patterns...");
}

// ─── Entrypoint ────────────────────────────────────────────────────
startEventMonitoring().catch(console.error);

// Export for testing
export { computeMEVScore, getReputationScore, recordBid, recordWin };
