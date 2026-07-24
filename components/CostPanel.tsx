// components/CostPanel.tsx — the /api/cost-estimate display, shared by Settings → Run and the
// onboarding wizard's confirm-run step. Priced from this install's own runs, never a hardcoded
// rate card. Says "not enough data yet" rather than inventing a number — a wrong cost estimate
// is worse than none.
export interface CostEstimate {
  perEngine: { engine: string; samples: number; avgCostUsd: number }[];
  unpriced: string[];
  prompts: number;
  samples: number;
  callsPerRun: number;
  perRunUsd: number | null;
  perMonthUsd: number | null;
}

export default function CostPanel({ est }: { est: CostEstimate }) {
  const money = (n: number) => (n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`);

  return (
    <div className="rounded-md border border-line bg-bg p-3">
      <div className="mb-2 text-xs font-medium text-muted">Estimated cost</div>

      {est.perRunUsd === null ? (
        <div className="text-sm text-muted">
          No priced runs yet — the first run will show its real cost, then this estimates from
          that going forward.
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <span>
              <span className="font-mono text-ink">{money(est.perRunUsd)}</span>
              <span className="text-muted"> per run</span>
            </span>
            <span>
              <span className="font-mono text-ink">{money(est.perMonthUsd!)}</span>
              <span className="text-muted"> per month, running daily</span>
            </span>
          </div>
          <div className="mt-1 font-mono text-xs text-faint">
            {est.prompts} prompt{est.prompts === 1 ? "" : "s"} × {est.samples} sample
            {est.samples === 1 ? "" : "s"} × {est.perEngine.length + est.unpriced.length} engine
            {est.perEngine.length + est.unpriced.length === 1 ? "" : "s"} = {est.callsPerRun} calls
          </div>

          <div className="mt-2 space-y-0.5 border-t border-line pt-2">
            {est.perEngine.map((e) => (
              <div key={e.engine} className="flex items-center gap-2 text-xs">
                <span className="min-w-0 flex-1 truncate font-mono text-muted">{e.engine}</span>
                <span className="font-mono text-faint">
                  {money(e.avgCostUsd)}/call · {e.samples} run{e.samples === 1 ? "" : "s"}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {est.unpriced.length > 0 && (
        <div className="mt-2 text-xs text-faint">
          Not counted yet (never run): {est.unpriced.join(", ")}
        </div>
      )}
    </div>
  );
}
