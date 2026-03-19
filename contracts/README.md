# MEVengers Smart Contracts ⛓️

This module contains the on-chain logic for MEV detection, autonomous locking, and protection auctions. It is built using **Foundry** and integrates with **Uniswap V4** and the **Reactive Network**.

## 🏗️ Core Contracts

### 1. `MEVengersHook.sol` (Unichain)
The heart of the program. A Uniswap V4 Hook that monitors every swap for MEV signatures.
- **`_beforeSwap`**: Calculates an MEV score in-memory based on swap volume and frequency. If the score exceeds `MEV_SCORE_THRESHOLD` (70/100), it emits an `MEVAlert`.
- **`lockPool`**: Triggered by the Reactive Sentinel. It freezes the pool by applying a 5.0% `LOCK_FEE` to attackers.
- **`placeBid`**: Public auction function for Guardians to bid ETH and propose a new, safe swap fee.
- **`settleAuctionAndUnlock`**: Finalizes the auction, applies the winning fee, and distributes the bid pot (50% to the Insurance Fund, 50% to the Guardian).

### 2. `MEVAuctionSentinel.sol` (Reactive Network)
The cross-chain manager that provides autonomous coordination.
- **`subscribeToMEVAlerts`**: Listens to Unichain events on the Reactive Network.
- **`react`**: Instantly dispatches a `lockPool` callback to Unichain when an alert is caught.
- **`Autonomous Settlement`**: Uses Reactive's block-ticking to monitor the 3-minute auction timer and fire the settlement callback as soon as it expires.

### 3. `MEVInsuranceFund.sol` (Unichain)
A secure vault that holds 50% of all winning auction bid premiums to compensate users who were targets of the original MEV attack.

## 🚀 Deployment & Testing

### Prerequisites
- [Foundry](https://getfoundry.sh/) installed.
- Uniswap V4 dependencies (Submodules).

### Setup
```bash
# Clone with submodules
git submodule update --init --recursive
# Build contracts
forge build
# Run tests
forge test
```

### Deployment (Unichain Sepolia)
```bash
# Load your private keys into .env
source .env
# Deploy Hook
forge script script/Deploy.s.sol --rpc-url $UNICHAIN_SEPOLIA_RPC_URL --broadcast
```

## 🛠️ Configuration
- `MEV_SCORE_THRESHOLD`: Default 70 (Adjustable by owner).
- `AUCTION_DURATION`: Default 180 seconds (3 mins).
- `LOCK_FEE`: Default 50,000 bps (5.0%).
- `DEFAULT_FEE`: Default 3,000 bps (0.3%).

---
**Powered by Uniswap V4 and Reactive Network.**
