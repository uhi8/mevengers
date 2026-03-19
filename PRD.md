# Product Requirements Document (PRD): MEVengers 🛡️

## 1. Executive Summary
**Project Name**: MEVengers
**Vision**: To democratize MEV protection by transforming it from a zero-sum extractive force into a positive-sum community mechanism where users actively participate in protecting each other.
**Core Technology**: Uniswap V4 (Unichain), Reactive Network, Telegram Bot, AI Sentinel (Viem).

MEVengers is an autonomous MEV protection system leveraging the **Reactive Network** to intelligently detect and neutralize attacks. It uses a novel **Time-Weighted Auction** mechanism to deter attackers and provide real-time insurance for retail users on Unichain.

---

## 2. Problem Statement
Retail traders on decentralized exchanges suffer from "invisible tax" via sandwich attacks and front-running.
1. **Static Fees**: Cannot adapt to dynamic MEV conditions.
2. **Post-Hoc Defense**: Most existing solutions provide retrospective analytics but no real-time protection.
3. **Complex UX**: Protection is difficult for non-technical users to engage with.
4. **Human Bottlenecks**: Auction settlements usually rely on human/bot intervention.

---

## 3. Proposed Solution
MEVengers creates an end-to-end ecosystem combining the rich UX of Telegram with the autonomous execution of Unichain and the Reactive Network.

### Key Innovations:
- **Autonomous Auction Manager**: The Reactive Network automatically initiates a "Protective Lock" upon MEV detection and autonomously settles the auction when time expires.
- **Hybrid Reliability (New)**: A high-performance Node.js Relayer provides safety-critical fallback settlement if cross-chain latency occurs.
- **AI Pre-emptive Intelligence (New)**: An off-chain AI Sentinel analyzes mempool and Flashblock (200ms) telemetry to predict attacks before they are confirmed.
- **Guardian Reputation (ERC-8004)**: Guardians earn reputation for successful defenses, enabling them to trade with near-zero fees (0.01%) even during pool locks.
- **Community Insurance**: 50% of the winning premium is stored in a pool-specific fund to compensate victims.

---

## 4. Architecture & Components

### 4.1 On-Chain (Unichain)
**MEVengersHook.sol (Uniswap V4 Hook)**
- **`lockPool()`**: Freezes extraction by applying a 5.0% `LOCK_FEE` to potential attackers.
- **`settleAuctionAndUnlock()`**: Finalizes the auction and distributes funds (exclusively called by Sentinel or Relayer).

**MEVInsuranceFund.sol**
- Holds and disburses auction proceeds to MEV victims on Unichain.

### 4.2 Cross-Chain (Reactive Network)
**MEVAuctionSentinel.sol**
- **Trigger**: Instantly catches `MEVAlert` from Unichain and emits `lockPool()` callback.
- **Timer**: Autonomously fires `settleAuctionAndUnlock()` after the 3-minute auction duration expires.

### 4.3 Off-Chain Intelligence (AI Agent)
- **Feature Tracking**: Analyzes volume spikes, time compression, and direction-flips.
- **Reputation Relay**: Commits off-chain Guardian scores to the on-chain Agent Registry via ERC-8004 feedback hooks.

### 4.4 User Interface (Telegram & Dashboard)
- **Telegram Bot**: The primary real-time command center for Guardians.
- **Next.js Dashboard**: Professional view for monitoring global MEV status and auction activity.

---

## 5. User Roles and Flows
1. **Retail Trader**: Benefits passively from community defense and insurance payouts.
2. **Guardian (Defender)**: Receives instant Telegram alerts, bids ETH to establish safe fees, and earns 50% of the bid pot.
3. **Attacker**: Finds their sandwich attacks unprofitable due to the 5.0% protective fee applied during the lock.

---

## 6. Success Metrics
- **Detection Latency**: Goal < 200ms (Flashblock pre-confirmation).
- **Autonomous Settlement Rate**: Goal 100% (via Reactive Sentinel + Hybrid Relayer).
- **Community Participation**: Measured by Guardian bid frequency and win rates.

---
**Built for the Ethereum 2026 Hackathon.** ⚡🛡️
