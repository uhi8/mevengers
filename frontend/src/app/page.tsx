const TELEGRAM_BOT_URL = "https://t.me/MEVengers_Protection_bot";

export default function Home() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(16,185,129,0.25),transparent_28%),radial-gradient(circle_at_85%_10%,rgba(56,189,248,0.20),transparent_30%),radial-gradient(circle_at_50%_80%,rgba(99,102,241,0.18),transparent_35%)]" />

      <main className="relative mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-10 md:px-10">
        <header className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-900/70 px-5 py-4 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-emerald-400/20 ring-1 ring-emerald-300/40" />
            <div>
              <p className="text-sm font-semibold tracking-wide">MEVengers</p>
              <p className="text-xs text-slate-400">Autonomous MEV Defense on Unichain</p>
            </div>
          </div>
          <a
            href={TELEGRAM_BOT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-xl border border-sky-300/30 bg-sky-400/10 px-4 py-2 text-sm font-medium text-sky-200 transition hover:bg-sky-400/20"
          >
            Open Telegram Bot
          </a>
        </header>

        <section className="grid gap-6 lg:grid-cols-3">
          <article className="lg:col-span-2 rounded-3xl border border-white/10 bg-slate-900/65 p-8 shadow-2xl shadow-black/30 backdrop-blur-xl">
            <p className="mb-4 inline-flex rounded-full border border-emerald-300/35 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-200">
              Hackathon Frontend • Live Demo Ready
            </p>
            <h1 className="text-3xl font-bold leading-tight tracking-tight md:text-5xl">
              Protect Swaps in Real-Time.
              <span className="block text-transparent bg-gradient-to-r from-emerald-300 to-sky-300 bg-clip-text">
                Coordinate Defense via Telegram + On-Chain Auctions.
              </span>
            </h1>
            <p className="mt-5 max-w-3xl text-base leading-7 text-slate-300 md:text-lg">
              MEVengers detects threats, locks pools, and settles auction protection automatically.
              This dashboard gives judges a professional view of status, bids, and response workflow.
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              <button className="rounded-xl bg-emerald-400 px-4 py-2.5 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-300">
                Connect Wallet
              </button>
              <a
                href={TELEGRAM_BOT_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl border border-white/20 px-4 py-2.5 text-sm font-semibold transition hover:bg-white/10"
              >
                Launch @MEVengers_Protection_bot
              </a>
            </div>
          </article>

          <aside className="rounded-3xl border border-white/10 bg-slate-900/65 p-6 backdrop-blur-xl">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Quick Access</h2>
            <div className="mt-4 space-y-3">
              <a
                href={TELEGRAM_BOT_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-xl border border-slate-700 bg-slate-800/80 p-3 transition hover:border-sky-300/50 hover:bg-slate-800"
              >
                <p className="text-sm font-semibold">Telegram Bot Link</p>
                <p className="mt-1 text-xs text-slate-400">t.me/MEVengers_Protection_bot</p>
              </a>
              <div className="rounded-xl border border-slate-700 bg-slate-800/70 p-3">
                <p className="text-sm font-semibold">Network</p>
                <p className="mt-1 text-xs text-slate-400">Unichain Sepolia (1301)</p>
              </div>
              <div className="rounded-xl border border-slate-700 bg-slate-800/70 p-3">
                <p className="text-sm font-semibold">Settlement Mode</p>
                <p className="mt-1 text-xs text-slate-400">Reactive + Fallback Relayer</p>
              </div>
            </div>
          </aside>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <article className="rounded-2xl border border-white/10 bg-slate-900/65 p-5 backdrop-blur-xl">
            <p className="text-sm text-slate-400">Pool Status</p>
            <p className="mt-2 text-2xl font-bold">Locked</p>
            <p className="mt-1 text-sm text-slate-400">MEV response actively running</p>
          </article>
          <article className="rounded-2xl border border-white/10 bg-slate-900/65 p-5 backdrop-blur-xl">
            <p className="text-sm text-slate-400">Highest Bid</p>
            <p className="mt-2 text-2xl font-bold">0.0000001 ETH</p>
            <p className="mt-1 text-sm text-slate-400">Winning fee: 0.30%</p>
          </article>
          <article className="rounded-2xl border border-white/10 bg-slate-900/65 p-5 backdrop-blur-xl">
            <p className="text-sm text-slate-400">Settlement ETA</p>
            <p className="mt-2 text-2xl font-bold">~180s</p>
            <p className="mt-1 text-sm text-slate-400">Auto-settle fallback enabled</p>
          </article>
        </section>

        <section className="rounded-3xl border border-white/10 bg-slate-900/60 p-6 backdrop-blur-xl">
          <h3 className="text-lg font-semibold">Production Integration Plan</h3>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <ul className="list-disc space-y-2 pl-5 text-slate-300">
              <li>Connect wallet using `wagmi` + `viem`</li>
              <li>Read `auctions(poolId)` from `MEVengersHook`</li>
              <li>Subscribe to `PoolLocked` and `AuctionSettled` events</li>
            </ul>
            <ul className="list-disc space-y-2 pl-5 text-slate-300">
              <li>Submit `placeBid(poolId, feeBps)` from UI</li>
              <li>Display winner + losers notification timeline</li>
              <li>Deep-link users to Telegram bot for alerts</li>
            </ul>
          </div>
        </section>
      </main>
    </div>
  );
}
