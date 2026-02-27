# Product Requirements Document (PRD): MEVengers

## 1. Executive Summary
**Project Name**: MEVengers
**Vision**: To democratize MEV protection by transforming it from a zero-sum extractive force into a positive-sum community mechanism where users actively participate in protecting each other.
**Core Technology**: Uniswap V4 (Unichain), Reactive Network, Telegram Bot integrated with Viem.

MEVengers is an autonomous MEV protection system. Unlike traditional static fee structures or after-the-fact insurance, MEVengers uses a novel Time-Weighted Auction mechanism dynamically managed by the Reactive Network to deter attackers and protect retail users on Unichain.

## 2. Problem Statement
Retail traders on decentralized exchanges suffer from "invisible tax" via sandwich attacks and front-running (Miner/Maximal Extractable Value - MEV).
Existing solutions are inadequate:
1. **Static Fees**: Cannot adapt to dynamic MEV extraction conditions.
2. **Post-Hoc**: No real-time alerts or proactive defense.
3. **Complex UX**: Protection is difficult for non-technical retail users to understand and engage with.
4. **Human Bottlenecks**: Auction-based or keeper-based defenses rely on human/bot intervention to execute and settle.

## 3. Proposed Solution
MEVengers creates an end-to-end ecosystem combining the rich, accessible UX of Telegram with the autonomous, low-latency execution of Unichain and the Reactive Network.

### Key Innovations:
- **Autonomous Auction Manager**: The Reactive Network automatically initiates an "Extraction Lock" upon MEV detection and autonomously settles the auction when time expires, requiring no manual "settle" transactions.
- **Time-Weighted Auctions**: Incentivizes rapid community response. Users bid for the right to establish the protective fee; earlier bids have greater weight.
- **Community Insurance**: 50% of the winning premium is stored in a pool-specific insurance fund to compensate MEV victims.

## 4. Architecture & Components

### 4.1 On-Chain Components (Unichain)
**MEVengersHook.sol (Uniswap V4 Hook)**
- **Purpose**: Tracks swaps, calculates MEV signatures (e.g., suspicious BalanceDeltas, rapid sequence swaps), and manages auction state securely.
- **Functions**:
  - `_beforeSwap()`: Analyzes swap and emits `MEVAlert` if thresholds are met.
  - `lockPool()`: Freezes extraction (exclusively called by Reactive Sentinel).
  - `settleAuctionAndUnlock(fee)`: Finalizes the auction and distributes funds (exclusively called by Reactive Sentinel).

**MEVInsuranceFund.sol**
- **Purpose**: Custodies the auction proceeds and handles claim distribution.

### 4.2 Cross-Chain Components (Reactive Network)
**MEVAuctionSentinel.sol**
- **Purpose**: Autonomous state manager for the MEV auctions.
- **Functions**:
  - `react(MEVAlert)`: Instantly dispatches a callback to Unichain to invoke `lockPool()`.
  - **Timer Logic**: Monitors block/time progression and autonomously fires a callback to invoke `settleAuctionAndUnlock(fee)` on Unichain without human intervention.

### 4.3 Off-Chain Components (Telegram Bot)
- **Purpose**: Providing an intuitive, gamified user interface for retail users.
- **Features**:
  - Real-time `MEVAlert` notifications based on Viem event listeners attached to Unichain.
  - Interactive Inline Keyboards for placing bids in the protective fee auction.
  - Winner notifications and transparent insurance fund updates.

## 5. User Roles and Flows

### 5.1 Retail Trader
1. Connects wallet to MEVengers Telegram Bot.
2. Swaps on Uniswap V4 (Unichain).
3. If targeted by MEV, benefits passively from community defense and insurance payouts.

### 5.2 Guardian (Auction Participant)
1. Receives instant Telegram `MEVAlert` that a pool is under attack.
2. The pool is autonomously locked by the Reactive Sentinel.
3. Guardian bids a protective fee via Telegram.
4. If they win (highest bid + time weight), they pay the premium, but receive a portion back, effectively acting as paid security.

### 5.3 Malicious Searcher (MEV Attacker)
1. Attempts a sandwich attack.
2. The initial swap triggers the Hook, emitting an alert.
3. The Reactive Sentinel instantly locks the pool, applying massive fees to subsequent swaps by the attacker, rendering the sandwich attack unprofitable.

## 6. Development Milestones
* **Phase 1: Smart Contracts (Unichain & Reactive)**: Develop and test the V4 Hook and Reactive Sentinel.
* **Phase 2: Off-chain Bot**: Adapt the Node.js/Viem Telegram bot to interact with the Unichain and Reactive Testnets.
* **Phase 3: Integration & Testing**: End-to-end testing of the complete flow (Detection -> Lock -> Bid -> Autonomous Settle -> Unlock).
* **Phase 4: Mainnet Deployment**: Launch on Unichain and Reactive Mainnet.
