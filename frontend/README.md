# MEVengers Dashboard 📊

The `frontend` module is a high-performance Next.js application that provides a professional terminal for monitoring MEV activity and coordinating pool defense on Unichain.

## 🚀 Key Features

### 1. Real-Time Status Monitoring
- **Pool Locked/Unlocked State**: Instant visual feedback when the Sentinel triggers a lock.
- **Auction Metrics**: Displays the current highest bid, proposed winning fee, and settlement ETA.

### 2. Multi-Persona Integration
- **Guardian Dashboard**: Built for judges to see how Alice and Bob (our demo personas) interact with the protocol.
- **Telegram Deep-Linking**: Direct access to the **MEVengers Bot** for real-time push alerts.

### 3. Modern Tech Stack
- **Next.js 15 (App Router)**: For optimized SSR and routing.
- **Tailwind CSS**: A "glassmorphism" design system tailored for a premium, high-stakes experience.
- **Viem/Wagmi**: Modular integration with the MEVengersHook on Unichain.

## 🛠️ Setup

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Environment Variables**:
   In your root `.env`, ensure the following are set:
   - `NEXT_PUBLIC_MEV_HOOK_ADDRESS`: The deployed V4 Hook.
   - `NEXT_PUBLIC_UNICHAIN_RPC`: Unichain Sepolia RPC.

3. **Run**:
   ```bash
   npm run dev
   ```

## 📂 Structure
- `src/app/page.tsx`: The main "Judge-Ready" landing and status page.
- `src/app/globals.css`: Custom "emerald-to-sky" gradient system and backdrop filters.

---
**Built for Unichain with Next.js.**
