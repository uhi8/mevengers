# MEVengers AI Agent 🤖

The `agent` module is the off-chain intelligence layer of the MEVengers ecosystem. It provides **ML-based MEV pattern detection** and a **Guardian Reputation Engine** to augment the on-chain Hook and Reactive Sentinel.

## 🚀 Key Responsibilities

### 1. Pre-emptive Detection (`src/index.ts`)
While the on-chain hook detects MEV post-hoc, the AI Agent monitors the **pending mempool** and **Flashblocks** (Unichain's 200ms pre-confirmations) to predict attacks before they are confirmed.
- **`computeMEVScore`**: A lightweight rolling feature-vector engine that analyzes swap frequency, volume spikes, and direction-flip patterns.
- **Pre-emptive Alerts**: Emits high-confidence risk signals used by the Telegram bot to notify Guardians *before* the pool is even locked.

### 2. Guardian Reputation Engine
The agent tracks the performance of every Guardian (User) to ensure the network is defended by honest participants.
- **Wins vs. Bids**: Calculates a win-rate-based score.
- **Activity Bonus**: Rewards Guardians who consistently participate in auctions.
- **On-Chain Feedback (ERC-8004)**: Relays reputation scores back to the on-chain **MEVengersAgentRegistry** using the `giveFeedbackByAddress` method.

### 3. Flashblock Monitoring
The agent is optimized for Unichain's low-latency block production, watching for "pending" events to get a 200-800ms head start over standard on-chain detection.

## 🛠️ Setup

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Environment Variables**:
   In your root `.env`, ensure the following are set:
   - `AI_AGENT_PRIVATE_KEY`: The agent's wallet for on-chain feedback.
   - `MEV_HOOK_ADDRESS`: The deployed V4 Hook.
   - `PREEMPTIVE_SCORE_THRESHOLD`: Default 75/100.
   - `MEV_AGENT_REGISTRY_ADDRESS`: The ERC-8004 registry on Unichain.

3. **Run**:
   ```bash
   npm run start
   ```

## 🧠 ML Features Tracked
- **Volume Spikes**: Detection of trades > 5x the rolling average.
- **Time Compression**: Swaps occurring < 2 seconds apart.
- **Direction Flip**: Consecutive swaps in the same direction (potential sandwich setup).

---
**Built with TypeScript, Viem, and ERC-8004.**
