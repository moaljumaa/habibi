// components/onboarding/StepConfirmRun.tsx — step 6, the last one: onboarding's data is already
// saved (brand, engines, prompts) and the instance is marked onboarded. This step just asks
// whether to start the first run now, showing what it costs before the user commits to it.
import { useEffect, useState } from "react";
import { Button, Notice } from "@/components/ui";
import CostPanel, { type CostEstimate } from "@/components/CostPanel";

export default function StepConfirmRun({ onDone }: { onDone: () => void }) {
  const [est, setEst] = useState<CostEstimate | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    fetch("/api/cost-estimate")
      .then((r) => r.json())
      .then(setEst)
      .catch(() => {});
  }, []);

  async function runNow() {
    setBusy(true);
    setErr("");
    const res = await fetch("/api/run-now", { method: "POST" });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) return setErr(data?.error ?? "Couldn't start the run.");
    onDone();
  }

  return (
    <div>
      <h1 className="text-xl font-medium text-ink">Ready to run</h1>
      <p className="mt-1 text-sm text-muted">
        Everything's set up. Run your prompts now, or start later from the dashboard whenever
        you're ready.
      </p>

      <div className="mt-6">{est && <CostPanel est={est} />}</div>

      {err && (
        <div className="mt-4">
          <Notice tone="danger">{err}</Notice>
        </div>
      )}

      <div className="mt-6 flex items-center gap-2">
        <Button variant="ghost" onClick={onDone} disabled={busy}>
          Skip for now
        </Button>
        <Button variant="primary" onClick={runNow} disabled={busy}>
          {busy ? "Starting…" : "Run now"}
        </Button>
      </div>
    </div>
  );
}
