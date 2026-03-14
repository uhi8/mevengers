# MEVengers 

MEVengers is the world's first **autonomous** MEV protection system leveraging **Uniswap V4**, **Unichain**, and the **Reactive Network** to intelligently detect and neutralize MEV attacks.

While traditional DeFi protections rely on slow, human-triggered governance or simple panic buttons, MEVengers uses a sophisticated Time-Weighted Auction mechanism dynamically managed by the Reactive Network.

🔗 **[View the full Product Requirements Document (PRD) here](./PRD.md)**

## The Architecture
Our unique approach maintains the fun, community-driven Telegram UX while fully automating the complex on-chain state transitions. This differentiates us from simple "Panic Switch" architectures.

1. 🔍 **Detection (Unichain)**: Our custom Uniswap V4 Hook monitors swaps for MEV signatures (e.g., suspicious BalanceDeltas, high price impacts). When triggered, it emits an `MEVAlert`.
2. 🛑 **Instant Lock (Reactive Network)**: The Reactive Sentinel instantly catches the `MEVAlert` from Unichain and loops back to Unichain to lock the pool (or temporarily apply an extreme anti-MEV fee), freezing out attackers.
3. ⚡ **Telegram Bidding (Off-chain UX)**: True to the original MEVengers vision, users are notified via the Telegram Bot. They bid for the "protective fee" in a Time-Weighted Auction that rewards early responders.
4. 🤖 **Automated Settlement (Reactive Network)**: Instead of a human keeper calling settlement, the Reactive Sentinel tracks the auction duration autonomously. Once time expires, it fires a callback to the V4 Hook to settle the auction, apply the winning fee, disburse the insurance fund to victims, and unlock the pool.

## Core Components

### 1. `contracts/src/MEVengersHook.sol` (Unichain)
The Uniswap V4 Hook that actively processes swaps, calculates MEV scores, and holds the auction state. It exposes `lockPool()` and `settleAuctionAndUnlock()` exclusively to the Reactive Sentinel.

### 2. `contracts/src/MEVAuctionSentinel.sol` (Reactive Network)
The autonomous manager that listens for Unichain events and orchestrates the auction lifecycle (Lock -> Settle -> Unlock) without human intervention.

### 3. `contracts/src/MEVInsuranceFund.sol` (Unichain)
Securely holds 50% of the winning auction premiums to compensate users targeted by the triggering MEV attack.

### 4. `bot/` (Telegram)
A responsive Node.js bot interacting with Unichain via Viem to give retail users an easy interface into the high-stakes world of MEV defense.

### 5. `agent/` (AI Sentinel)
MVP off-chain intelligence service that now includes:
- pending mempool monitoring for pre-emptive risk signals,
- lightweight local state persistence (`agent_state.json`) for swap/reputation continuity,
- active MEV score loop execution on observed activity,
- ERC-8004 auto-registration bootstrap on startup.

## Setup and Development

### Prerequisites
- [Foundry](https://getfoundry.sh/) installed.

### Build
```bash
forge build
```

### Test
```bash
forge test
```

### Runtime Integration (Bot + Fallback Relayer)
To ensure the auction flow always completes (lock -> bid -> settle -> unlock), run both services in parallel:

```bash
cd bot && npm install
npm run start
```

In a second terminal:

```bash
cd bot && npm run relay
```

The relayer now performs:
- fallback `lockPool()` if Reactive callback lags,
- fallback `settleAuctionAndUnlock()` after `auctionEnd` if settlement callback lags.

It also performs startup recovery by scanning recent `PoolLocked` events and re-scheduling fallback settlement for still-locked pools.

*(Further instructions on deploying to Unichain and Reactive Testnets coming soon)*
