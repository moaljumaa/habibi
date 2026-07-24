// components/onboarding/StepEngines.tsx — step 4: exactly 4 recognizable engines, no 300-model
// picker. Each card auto-resolves to that vendor's newest OpenRouter model (VendorEngineCards).
import { useState } from "react";
import { Button, Notice } from "@/components/ui";
import VendorEngineCards from "@/components/VendorEngineCards";

export default function StepEngines({
  onBack,
  onDone,
}: {
  onBack: () => void;
  onDone: () => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function next() {
    if (!selected.length) return setErr("Pick at least one engine to track.");
    setBusy(true);
    setErr("");
    const res = await fetch("/api/providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "openrouter", models: selected }),
    });
    setBusy(false);
    if (!res.ok) return setErr("Couldn't save your engines. Try again.");
    onDone();
  }

  return (
    <div>
      <h1 className="text-xl font-medium text-ink">Choose engines to track</h1>
      <p className="mt-1 text-sm text-muted">
        We'll check your visibility across these on every run.
      </p>

      <div className="mt-6">
        <VendorEngineCards selected={selected} onChange={setSelected} />
      </div>

      {err && (
        <div className="mt-4">
          <Notice tone="danger">{err}</Notice>
        </div>
      )}

      <div className="mt-6 flex gap-2">
        <Button onClick={onBack} variant="ghost">
          Back
        </Button>
        <Button variant="primary" onClick={next} disabled={busy}>
          {busy ? "Saving…" : "Next"}
        </Button>
      </div>
    </div>
  );
}
