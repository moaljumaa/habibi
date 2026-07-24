import { useEffect, useState, useCallback } from "react";
import Layout from "@/components/Layout";
import { Card, PageTitle, Bar, Spark, EngineTag, Pct } from "@/components/ui";

interface Dashboard {
  engines: string[];
  running: boolean;
  spendToday: number;
  hasSelfBrand: boolean;
  extractionReady: boolean;
  failures: { engine: string; error: string; count: number; last_at: string }[];
  visibilityByEngine: { engine: string; visibility: number; runs: number }[];
  shareOfVoice: { brand_id: string; name: string; is_self: number; mentions: number }[];
  visibilityTrend: { day: string; visibility: number }[];
}

interface Estimate {
  perRunUsd: number | null;
  perMonthUsd: number | null;
  callsPerRun: number;
}

export default function Overview() {
  const [d, setD] = useState<Dashboard | null>(null);
  const [est, setEst] = useState<Estimate | null>(null);
  const [msg, setMsg] = useState<string>("");

  const load = useCallback(() => {
    fetch("/api/dashboard").then((r) => r.json()).then(setD).catch(() => {});
    fetch("/api/cost-estimate").then((r) => r.json()).then(setEst).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000); // refresh while runs happen
    return () => clearInterval(t);
  }, [load]);

  async function runNow() {
    setMsg("");
    const res = await fetch("/api/run-now", { method: "POST" });
    if (res.ok) setMsg("Run started — results will appear as they land.");
    else setMsg((await res.json()).error ?? "Could not start run");
    load();
  }

  const totalMentions = d?.shareOfVoice.reduce((s, b) => s + b.mentions, 0) ?? 0;

  return (
    <Layout>
      <PageTitle
        right={
          <div className="flex items-center gap-3">
            {/* The price of the click, before the click. */}
            {est?.perRunUsd != null && !d?.running && (
              <span className="text-xs text-muted">
                ≈<span className="font-mono text-ink">${est.perRunUsd.toFixed(2)}</span>
                <span className="text-faint"> · {est.callsPerRun} calls</span>
              </span>
            )}
            <button
              onClick={runNow}
              disabled={d?.running}
              className="rounded-md bg-accent px-3 py-1.5 text-sm text-white transition-colors hover:brightness-110 disabled:opacity-50"
            >
              {d?.running ? "Running…" : "Run now"}
            </button>
          </div>
        }
      >
        Overview
      </PageTitle>

      {msg && <div className="mb-4 text-sm text-muted">{msg}</div>}

      {d && d.engines.length === 0 && (
        <Card>
          <div className="text-sm text-muted">
            No engines configured. Add a provider API key in <strong>Settings → Engines</strong>.
          </div>
        </Card>
      )}

      {/* Failed runs are stored, not thrown — surface them or the dashboard just looks empty. */}
      {d && d.failures?.length > 0 && (
        <div className="mb-4 rounded-md border border-danger/30 bg-danger/10 px-3 py-2">
          <div className="text-sm font-medium text-danger">
            {d.failures.reduce((s, f) => s + f.count, 0)} run
            {d.failures.reduce((s, f) => s + f.count, 0) === 1 ? "" : "s"} failed in the last 24h
          </div>
          <div className="mt-1 space-y-1">
            {d.failures.map((f, i) => (
              <div key={i} className="text-xs text-danger/80">
                <span className="font-mono">{f.engine}</span>
                {f.count > 1 && <span className="text-danger/60"> ×{f.count}</span>} — {f.error}
              </div>
            ))}
          </div>
        </div>
      )}

      {d && d.engines.length > 0 && d.extractionReady === false && (
        <div className="mb-4 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          Mention extraction is off — no OpenRouter or OpenAI key. Runs will collect citations
          but visibility stays at 0%. Add a key in Settings → Engines.
        </div>
      )}

      {d && d.engines.length > 0 && !d.hasSelfBrand && (
        <div className="mb-4 rounded-md border border-line bg-panel px-3 py-2 text-sm text-muted">
          No brand marked as yours yet — runs will fetch answers but can’t measure visibility.
          Add one in Settings → Brands.
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 mb-4">
        <Card title="Visibility by engine">
          <div className="space-y-3">
            {d?.visibilityByEngine.length ? (
              d.visibilityByEngine.map((e) => (
                <div key={e.engine}>
                  <div className="flex items-center gap-2 mb-1">
                    <EngineTag id={e.engine} />
                    <span className="text-xs text-muted">{e.runs} runs</span>
                  </div>
                  <Bar value={e.visibility} />
                </div>
              ))
            ) : (
              <div className="text-sm text-muted">No runs yet. Hit “Run now”.</div>
            )}
          </div>
        </Card>

        <Card title="Visibility trend">
          <Spark points={(d?.visibilityTrend ?? []).map((p) => p.visibility)} />
          <div className="text-xs text-muted mt-2">
            Share of runs mentioning you, per day (last 30 days).
          </div>
        </Card>
      </div>

      <Card title="Share of voice">
        {d?.shareOfVoice.length ? (
          <div className="space-y-2">
            {d.shareOfVoice.map((b) => (
              <div key={b.brand_id} className="flex items-center gap-3">
                <div className="w-40 truncate text-sm">
                  {b.name} {b.is_self ? <span className="text-xs text-muted">(you)</span> : null}
                </div>
                <div className="flex-1">
                  <Bar value={totalMentions ? b.mentions / totalMentions : 0} />
                </div>
                <div className="w-10 text-right text-xs text-muted">{b.mentions}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-muted">
            Add your brand and competitors in Settings, then run.
          </div>
        )}
      </Card>

      <div className="mt-4 flex flex-wrap gap-x-5 text-xs text-muted">
        <span>
          Spend today <span className="font-mono text-ink">${d?.spendToday.toFixed(3) ?? "0.000"}</span>
        </span>
        {est?.perMonthUsd != null && (
          <span>
            Daily monitoring ≈
            <span className="font-mono text-ink">${est.perMonthUsd.toFixed(2)}</span>/month
          </span>
        )}
      </div>
    </Layout>
  );
}
