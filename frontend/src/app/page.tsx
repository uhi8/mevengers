"use client";

import { useState, useEffect } from "react";

const TELEGRAM_BOT_URL = "https://t.me/MEVengers_Protection_bot";
const GITHUB_URL = "https://github.com/uhi8/mevengers";

export default function Home() {
  const [isLocked, setIsLocked] = useState(false);
  const [bidValue, setBidValue] = useState("0.000");
  const [countdown, setCountdown] = useState(180);

  const triggerSimulation = () => {
    setIsLocked(true);
    setCountdown(180);
    setBidValue("0.000");
    
    // Auto-bid after 3 seconds to show community response
    setTimeout(() => {
      setBidValue("0.001 ETH");
    }, 3000);
  };

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isLocked && countdown > 0) {
      timer = setInterval(() => {
        setCountdown((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isLocked, countdown]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100 font-sans">
      {/* Dynamic Background */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(16,185,129,0.25),transparent_28%),radial-gradient(circle_at_85%_10%,rgba(56,189,248,0.20),transparent_30%),radial-gradient(circle_at_50%_80%,rgba(99,102,241,0.18),transparent_35%)]" />

      <main className="relative mx-auto flex w-full max-w-7xl flex-col gap-12 px-6 py-10 md:px-10">
        {/* Header */}
        <header className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-900/40 px-6 py-4 backdrop-blur-2xl">
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-400/30">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.333 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
              </svg>
            </div>
            <div>
              <p className="text-base font-bold tracking-tight">MEVengers</p>
              <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Sentinel Protocol</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <a href={GITHUB_URL} target="_blank" className="text-sm font-medium text-slate-400 transition hover:text-white">GitHub</a>
            <a
              href={TELEGRAM_BOT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-xl bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-400 ring-1 ring-emerald-500/20 transition hover:bg-emerald-500/20"
            >
              Open Telegram
            </a>
          </div>
        </header>

        {/* Hero Section */}
        <section className="grid gap-8 lg:grid-cols-5 items-center">
          <div className="lg:col-span-3 space-y-6">
            <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold backdrop-blur-sm transition-colors duration-500 ${isLocked ? 'border-red-400/20 bg-red-500/5 text-red-400' : 'border-emerald-400/20 bg-emerald-500/5 text-emerald-400'}`}>
              <span className="relative flex h-2 w-2">
                <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${isLocked ? 'bg-red-400' : 'bg-emerald-400'}`}></span>
                <span className={`relative inline-flex h-2 w-2 rounded-full ${isLocked ? 'bg-red-500' : 'bg-emerald-500'}`}></span>
              </span>
              {isLocked ? 'Threat Detected - Protocol Locked' : 'Unichain Sentinel Active'}
            </div>
            <h1 className="text-4xl font-extrabold leading-[1.1] tracking-tight md:text-6xl">
              Shielding Unichain. <br />
              <span className={`transition-all duration-700 text-transparent bg-gradient-to-r bg-clip-text ${isLocked ? 'from-red-400 via-orange-400 to-amber-400' : 'from-emerald-400 via-sky-400 to-indigo-400'}`}>
                {isLocked ? 'Intervening Now.' : 'Autonomously.'}
              </span>
            </h1>
            <p className="text-lg text-slate-400 leading-relaxed max-w-2xl">
              A block-speed defense layer for Uniswap V4. MEVengers detects predatory signatures, 
              locks vulnerable pools, and initiates community-led safe fee auctions.
            </p>
            <div className="flex flex-wrap gap-4 pt-4">
              <button 
                onClick={triggerSimulation}
                className="group relative flex items-center gap-2 rounded-xl bg-emerald-500 px-6 py-3.5 text-sm font-bold text-emerald-950 transition hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={isLocked}
              >
                {isLocked ? 'Simulation Running...' : 'Trigger MEV Attack (Demo)'}
                {!isLocked && (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="size-4 animate-pulse">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                  </svg>
                )}
              </button>
              <a 
                href="/presentation.html" 
                className="rounded-xl border border-white/10 bg-white/5 px-6 py-3.5 text-sm font-bold transition hover:bg-white/10"
              >
                View Master Deck
              </a>
            </div>
          </div>

          {/* Quick Metrics */}
          <div className="lg:col-span-2 grid gap-4">
            <div className={`group rounded-3xl border border-white/10 bg-slate-900/30 p-6 backdrop-blur-xl transition hover:bg-slate-900/50 ${isLocked ? 'ring-2 ring-red-500/20' : ''}`}>
              <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500">Sentinel Status</h3>
              <div className="mt-2 flex items-center justify-between">
                <p className={`text-3xl font-black transition-colors duration-500 ${isLocked ? 'text-red-400' : 'text-emerald-400'}`}>
                  {isLocked ? 'LOCKED' : 'IDLE'}
                </p>
                <div className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-800 ring-1 transition-all duration-500 ${isLocked ? 'text-red-400 ring-red-500/30' : 'text-emerald-400 ring-emerald-500/30'}`}>
                  {isLocked ? (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="size-6">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="size-6">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5V6.75a4.5 4.5 0 1 1 9 0v3.75M3.75 21.75h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H3.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                    </svg>
                  )}
                </div>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                {isLocked ? 'MEV signature identified. Corrective auction live.' : 'Monitoring Flashblocks...'}
              </p>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-3xl border border-white/10 bg-slate-900/30 p-6 backdrop-blur-xl">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Guardian Bid</h3>
                <p className="mt-1 text-xl font-bold">{isLocked ? bidValue : '—'}</p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-slate-900/30 p-6 backdrop-blur-xl">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Auction Ends</h3>
                <p className="mt-1 text-xl font-bold">{isLocked ? `${countdown}s` : '—'}</p>
              </div>
            </div>
          </div>
        </section>

        {/* Links Grid */}
        <section className="grid gap-6 md:grid-cols-3">
          <div className="group relative overflow-hidden rounded-3xl border border-white/10 bg-slate-900/20 p-8 transition hover:border-emerald-500/50">
            <div className="mb-4 text-emerald-400"><i className="fa-solid fa-anchor text-2xl"></i></div>
            <h4 className="text-lg font-bold">Uniswap V4 Hook</h4>
            <p className="mt-2 text-sm text-slate-400">On-chain detection engine analyzing Flashblocks for front-running signatures.</p>
          </div>
          <div className="group relative overflow-hidden rounded-3xl border border-white/10 bg-slate-900/20 p-8 transition hover:border-sky-500/50">
            <div className="mb-4 text-sky-400"><i className="fa-solid fa-satellite text-2xl"></i></div>
            <h4 className="text-lg font-bold">Reactive Sentinel</h4>
            <p className="mt-2 text-sm text-slate-400">Autonomous coordinator managing cross-chain alerts and settlement callbacks.</p>
          </div>
          <div className="group relative overflow-hidden rounded-3xl border border-white/10 bg-slate-900/20 p-8 transition hover:border-indigo-500/50">
            <div className="mb-4 text-indigo-400"><i className="fa-brands fa-telegram text-2xl"></i></div>
            <h4 className="text-lg font-bold">Telegram Guardian persona</h4>
            <p className="mt-2 text-sm text-slate-400">Community defense layer allowing users to define and profit from protective safety fees.</p>
          </div>
        </section>

        {/* Footer */}
        <footer className="flex flex-col items-center justify-between gap-4 border-t border-white/5 py-8 md:flex-row">
          <p className="text-xs text-slate-500 text-center">Built for Unichain + Reactive Network Hookathon @ 2026</p>
          <div className="flex gap-6">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-600">Unichain Sepolia 1301</span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-600">Reactive Network Mainnet</span>
          </div>
        </footer>
      </main>
    </div>
  );
}


