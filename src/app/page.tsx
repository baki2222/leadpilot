"use client";

import { useEffect, useState } from "react";
import { DEFAULT_ICP, SERVICE_KEYWORDS, type ICP, type QualifyResult, type Tier } from "@/lib/leads";

type CrmCard = { id: string; at: string } & QualifyResult;

const SAMPLES = [
  {
    label: "SaaS founder",
    text: `Hi there,

I'm Sarah Chen, co-founder and CEO of Brightpath Health. We want to build an AI chatbot for our patient portal that answers questions from our knowledge base and books appointments through our existing API.

Budget is around $18k and we'd like to start in the next 4 weeks.

Thanks,
Sarah Chen
sarah@brightpath-health.com`,
  },
  {
    label: "Agency manager",
    text: `Hello! My name is Tom Becker, project manager at Pixelforge Agency. One of our clients needs a workflow automation that syncs leads from their website forms into HubSpot and sends Slack alerts.

We have a budget of $3,500. Timeline is flexible, maybe in 2 months.

Best,
Tom
tom.becker@pixelforge.io`,
  },
  {
    label: "Vague request",
    text: `hey can you make me a website like amazon but better? I don't have much money, maybe $300. no rush.

thanks
mike_88@gmail.com`,
  },
];

const TIERS: { tier: Tier; color: string }[] = [
  { tier: "Hot", color: "bg-rose-500" },
  { tier: "Warm", color: "bg-amber-500" },
  { tier: "Cold", color: "bg-sky-500" },
  { tier: "Disqualified", color: "bg-slate-400" },
];

const STORAGE_KEY = "leadpilot-crm";

export default function Home() {
  const [text, setText] = useState(SAMPLES[0].text);
  const [icp, setIcp] = useState<ICP>(DEFAULT_ICP);
  const [busy, setBusy] = useState(false);
  const [current, setCurrent] = useState<QualifyResult | null>(null);
  const [visibleSteps, setVisibleSteps] = useState(0);
  const [crm, setCrm] = useState<CrmCard[]>([]);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setCrm(JSON.parse(saved));
    } catch {
      /* storage unavailable: start with an empty board */
    }
  }, []);

  function saveCrm(next: CrmCard[]) {
    setCrm(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  async function qualify() {
    setBusy(true);
    setError(null);
    setCurrent(null);
    setVisibleSteps(0);
    try {
      const res = await fetch("/api/qualify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, icp }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      setCurrent(data);
      // Reveal the agent's steps one by one so the trace reads like a run log.
      for (let i = 1; i <= data.steps.length; i++) {
        await new Promise((r) => setTimeout(r, 450));
        setVisibleSteps(i);
      }
      saveCrm([{ ...data, id: crypto.randomUUID(), at: new Date().toISOString() }, ...crm]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const toggleService = (s: string) =>
    setIcp((p) => ({ ...p, services: p.services.includes(s) ? p.services.filter((x) => x !== s) : [...p.services, s] }));

  return (
    <div className="min-h-screen">
      <header className="border-b border-zinc-800 bg-zinc-950">
        <div className="mx-auto max-w-7xl px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-emerald-500 text-zinc-950 grid place-items-center font-black">L</div>
            <div>
              <h1 className="font-semibold text-white leading-tight">LeadPilot</h1>
              <p className="text-xs text-zinc-400">An AI agent that qualifies inbound leads, drafts the reply, and files them in your CRM</p>
            </div>
          </div>
          <a href="https://github.com/baki2222/leadpilot" target="_blank" rel="noreferrer" className="text-sm text-zinc-400 hover:text-emerald-400">
            Source on GitHub →
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 space-y-6">
        <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          {/* Input */}
          <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-white">Inbound message</h2>
              <div className="flex gap-1.5">
                {SAMPLES.map((s) => (
                  <button
                    key={s.label}
                    onClick={() => setText(s.text)}
                    className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:border-emerald-500"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={11}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 p-3 text-sm text-zinc-200 font-mono outline-none focus:border-emerald-500"
              placeholder="Paste an email or contact-form submission…"
            />

            <details className="rounded-lg border border-zinc-800 p-3 text-sm text-zinc-300">
              <summary className="cursor-pointer font-medium text-white">Ideal customer profile</summary>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <label className="space-y-1">
                  <span className="text-xs text-zinc-400">Minimum budget (USD)</span>
                  <input
                    type="number"
                    value={icp.minBudget}
                    onChange={(e) => setIcp({ ...icp, minBudget: Number(e.target.value) })}
                    className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-zinc-400">Start within (months)</span>
                  <input
                    type="number"
                    value={icp.maxTimelineMonths}
                    onChange={(e) => setIcp({ ...icp, maxTimelineMonths: Number(e.target.value) })}
                    className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1"
                  />
                </label>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {Object.keys(SERVICE_KEYWORDS).map((s) => (
                  <button
                    key={s}
                    onClick={() => toggleService(s)}
                    className={`rounded-full px-2.5 py-1 text-xs border ${
                      icp.services.includes(s) ? "border-emerald-500 bg-emerald-500/15 text-emerald-300" : "border-zinc-700 text-zinc-400"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </details>

            <button
              onClick={qualify}
              disabled={busy || !text.trim()}
              className="w-full rounded-lg bg-emerald-500 py-2.5 font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50"
            >
              {busy ? "Agent running…" : "Run qualification agent"}
            </button>
            {error && <p className="text-sm text-rose-400">{error}</p>}
          </section>

          {/* Agent trace + result */}
          <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-white">Agent run</h2>
              {current && (
                <span className="text-[11px] rounded-full border border-zinc-700 px-2 py-0.5 text-zinc-400">
                  {current.mode === "llm" ? "Claude tool-use agent" : "Demo mode · rule-based extractor"}
                </span>
              )}
            </div>

            {!current && !busy && <p className="text-sm text-zinc-500">Run the agent to see each step it takes.</p>}
            {busy && !current && <p className="text-sm text-zinc-400 animate-pulse">Thinking…</p>}

            {current && (
              <ol className="space-y-3">
                {current.steps.slice(0, visibleSteps).map((s, i) => (
                  <li key={i} className="flex gap-3">
                    <div className="mt-1 h-5 w-5 shrink-0 rounded-full bg-emerald-500/20 text-emerald-400 grid place-items-center text-[11px] font-bold">
                      {i + 1}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm text-white">
                        {s.title} <code className="ml-1 text-[11px] text-zinc-500">{s.tool}()</code>
                      </p>
                      <pre className="mt-1 whitespace-pre-wrap text-xs text-zinc-400 font-mono">{s.detail}</pre>
                    </div>
                  </li>
                ))}
              </ol>
            )}

            {current && visibleSteps === current.steps.length && (
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-wide text-zinc-500">Drafted reply</p>
                  <button
                    onClick={() => {
                      navigator.clipboard?.writeText(`Subject: ${current.reply.subject}\n\n${current.reply.body}`);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    }}
                    className="text-xs text-emerald-400 hover:underline"
                  >
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
                <p className="mt-2 text-sm font-medium text-white">{current.reply.subject}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-300">{current.reply.body}</p>
              </div>
            )}
          </section>
        </div>

        {/* CRM pipeline */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-white">CRM pipeline</h2>
            {crm.length > 0 && (
              <button onClick={() => saveCrm([])} className="text-xs text-zinc-500 hover:text-rose-400">
                Clear board
              </button>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {TIERS.map(({ tier, color }) => {
              const cards = crm.filter((c) => c.result.tier === tier);
              return (
                <div key={tier} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 min-h-40">
                  <div className="flex items-center gap-2 mb-3">
                    <span className={`h-2 w-2 rounded-full ${color}`} />
                    <span className="text-sm font-medium text-white">{tier}</span>
                    <span className="text-xs text-zinc-500">{cards.length}</span>
                  </div>
                  <div className="space-y-2">
                    {cards.map((c) => (
                      <div key={c.id} className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium text-white truncate">{c.lead.name ?? "Unknown"}</p>
                          <span className="text-xs font-mono text-zinc-400">{c.result.score}</span>
                        </div>
                        <p className="text-xs text-zinc-500 truncate">{c.lead.company ?? c.lead.email ?? "—"}</p>
                        <p className="mt-1.5 text-xs text-zinc-400 line-clamp-3">{c.summary}</p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
