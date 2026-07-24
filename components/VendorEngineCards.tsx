// components/VendorEngineCards.tsx — the 4 recognizable engines (ChatGPT, Claude, Gemini,
// Perplexity), each auto-resolved to its newest OpenRouter model. Shared by the onboarding
// wizard's engine step and Settings → Engines, so both surfaces stay in sync.
import { useEffect, useState } from "react";
import { Notice } from "./ui";

interface Vendor {
  id: string;
  label: string;
  model: string | null;
}

export default function VendorEngineCards({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (models: string[]) => void;
}) {
  const [vendors, setVendors] = useState<Vendor[] | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    fetch("/api/vendor-models")
      .then((r) => r.json())
      .then((d) => (d.vendors ? setVendors(d.vendors) : setErr(d.error ?? "Couldn't load models.")))
      .catch(() => setErr("Couldn't reach OpenRouter."));
  }, []);

  if (err) return <Notice tone="danger">{err}</Notice>;
  if (!vendors) {
    return <div className="text-sm text-muted">Loading engines…</div>;
  }

  function toggle(model: string | null) {
    if (!model) return;
    onChange(selected.includes(model) ? selected.filter((m) => m !== model) : [...selected, model]);
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      {vendors.map((v) => {
        const on = !!v.model && selected.includes(v.model);
        return (
          <button
            key={v.id}
            type="button"
            onClick={() => toggle(v.model)}
            disabled={!v.model}
            className={`rounded-lg border px-4 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              on
                ? "border-accent bg-accent/10"
                : "border-line bg-panel hover:border-faint"
            }`}
          >
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{v.label}</span>
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${on ? "bg-accent" : "bg-faint"}`}
              />
            </div>
            <div className="mt-0.5 truncate font-mono text-xs text-faint">
              {v.model ?? "unavailable"}
            </div>
          </button>
        );
      })}
    </div>
  );
}
