# MEVengers Bot & Relayer 🤖

The `bot` module is the primary user interface and reliability layer for the MEVengers ecosystem. It consists of a **Telegram Guardian Bot** for real-time community defense and a **Hybrid Relayer** for mission-critical settlement fallbacks.

## 🚀 Components

### 1. Telegram Guardian Bot (`src/index.js`)
The bot provides a simplified, gamified UX for retail users to participate in high-stakes MEV auctions.
- **Real-Time Alerts**: Broadcasts `MEVAlert` events from Unichain with enriched AI insights.
- **One-Click Bidding**: Inline keyboards allow users to bid ETH and propose protective fees instantly.
- **Persona Management**: Maps Telegram IDs to demo wallets (Alice, Bob) for seamless testing.
- **Commands**:
  - `/connect`: Link your wallet to a Guardian persona.
  - `/trigger`: Manually fire a `lockPool` transaction for demo purposes.
  - `/simulate`: Test the bidding interface without spending real testnet ETH.

### 2. Hybrid Relayer (`src/relayer.js`)
The relayer ensures the "Lock -> Auction -> Settle" lifecycle is completed even if cross-chain callbacks from the Reactive Network experience latency.
- **Fallback Locking**: If the Sentinel doesn't lock the pool within 10 seconds of an alert, the relayer submits the transaction.
- **Fallback Settlement**: Monitors auction timers and triggers `settleAuctionAndUnlock` if the autonomous sentinel lags.
- **Startup Recovery**: Scans history for any "orphaned" locked pools and re-schedules their settlement.

## 🛠️ Setup

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Environment Variables**:
   Ensure the following are set in your root `.env`:
   - `TELEGRAM_BOT_TOKEN`: From BotFather.
   - `MEV_HOOK_ADDRESS`: The deployed V4 Hook.
   - `DEPLOYER_PRIVATE_KEY`: For relayer and bot-triggered on-chain actions.
   - `ALICE_PRIVATE_KEY` / `BOB_PRIVATE_KEY`: For demo bidding.

3. **Run**:
   ```bash
   # Live Bot
   npm run start
   
   # Reliability Relayer
   npm run relay
   ```

## 🧪 Demo Scripts
- `test_send.js`: Test basic transaction broadcasting.
- `src/demo_ping.js`: A full E2E demo script that locks a pool and places a bid to verify the entire event chain.

---
**Built with Viem & Node-Telegram-Bot-API.**
