// components/onboarding/StepPrompts.tsx — step 5: an AI-drafted starter prompt set, grouped by
// topic, editable/deselectable. Finishing persists the accepted prompts through the existing
// POST /api/prompts and marks onboarding complete — the actual first run is a separate,
// explicit confirmation on the next step (StepConfirmRun), not automatic.
import { useEffect, useState } from "react";
import { Button, Notice } from "@/components/ui";

interface Topic {
  topic: string;
  prompts: string[];
}
interface Selectable extends Topic {
  selected: boolean[];
}

export default function StepPrompts({
  onBack,
  onDone,
}: {
  onBack: () => void;
  onDone: () => void;
}) {
  const [topics, setTopics] = useState<Selectable[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    fetch("/api/onboarding/suggest-prompts", { method: "POST" })
      .then((r) => r.json())
      .then((d) =>
        setTopics(
          (d.topics ?? []).map((t: Topic) => ({ ...t, selected: t.prompts.map(() => true) }))
        )
      )
      .catch(() => setTopics([]));
  }, []);

  function toggle(ti: number, pi: number) {
    setTopics((prev) =>
      prev!.map((t, i) =>
        i !== ti ? t : { ...t, selected: t.selected.map((s, j) => (j === pi ? !s : s)) }
      )
    );
  }

  function editPrompt(ti: number, pi: number, text: string) {
    setTopics((prev) =>
      prev!.map((t, i) =>
        i !== ti ? t : { ...t, prompts: t.prompts.map((p, j) => (j === pi ? text : p)) }
      )
    );
  }

  async function finish() {
    setBusy(true);
    setErr("");
    try {
      const accepted = (topics ?? []).flatMap((t) =>
        t.prompts.filter((_, i) => t.selected[i]).map((text) => ({ text, tags: [t.topic] }))
      );
      for (const p of accepted) {
        await fetch("/api/prompts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(p),
        });
      }
      await fetch("/api/onboarding/complete", { method: "POST" });
      onDone();
    } catch {
      setErr("Couldn't save your prompts. Try again.");
      setBusy(false);
    }
  }

  const acceptedCount = (topics ?? []).reduce(
    (n, t) => n + t.selected.filter(Boolean).length,
    0
  );

  return (
    <div>
      <h1 className="text-xl font-medium text-ink">Review prompts</h1>
      <p className="mt-1 text-sm text-muted">
        We drafted these from your brand profile. Uncheck any you don't want, or edit the wording.
      </p>

      <div className="mt-6 max-h-96 space-y-4 overflow-y-auto">
        {topics === null && <div className="text-sm text-muted">Drafting prompts…</div>}
        {topics?.length === 0 && (
          <div className="text-sm text-muted">
            Couldn't draft prompts automatically — you can add your own later from Prompts.
          </div>
        )}
        {topics?.map((t, ti) => (
          <div key={t.topic} className="rounded-lg border border-line bg-panel p-3">
            <div className="mb-2 text-xs font-medium text-muted">{t.topic}</div>
            <div className="space-y-1.5">
              {t.prompts.map((p, pi) => (
                <label key={pi} className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={t.selected[pi]}
                    onChange={() => toggle(ti, pi)}
                    className="mt-0.5"
                  />
                  <input
                    value={p}
                    onChange={(e) => editPrompt(ti, pi, e.target.value)}
                    className="flex-1 bg-transparent text-ink focus:outline-none"
                  />
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      {err && (
        <div className="mt-4">
          <Notice tone="danger">{err}</Notice>
        </div>
      )}

      <div className="mt-6 flex items-center gap-2">
        <Button onClick={onBack} variant="ghost">
          Back
        </Button>
        <Button variant="primary" onClick={finish} disabled={busy || topics === null}>
          {busy ? "Finishing…" : "Finish"}
        </Button>
        <span className="text-xs text-muted">{acceptedCount} prompt(s) selected</span>
      </div>
    </div>
  );
}
