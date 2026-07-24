// components/onboarding/StepKey.tsx — step 1: the mandatory OpenRouter key. Nothing else in the
// wizard is reachable without a validated key, since every later step's LLM calls pay through it.
import { useState } from "react";
import { Button, Field, Input, Notice } from "@/components/ui";

export default function StepKey({ onDone }: { onDone: () => void }) {
  const [key, setKey] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function connect() {
    setBusy(true);
    setErr("");
    const res = await fetch("/api/onboarding/validate-key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey: key }),
    });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (data?.ok) return onDone();
    setErr(data?.error ?? "Couldn't validate that key. Try again.");
  }

  return (
    <div>
      <h1 className="text-xl font-medium text-ink">Connect OpenRouter</h1>
      <p className="mt-1 text-sm text-muted">
        Habibi runs your prompts through OpenRouter so it can reach ChatGPT, Claude, Gemini, and
        Perplexity with one key. You pay OpenRouter directly, in cents per run.
      </p>

      <div className="mt-6 space-y-3">
        <Field label="OpenRouter API key" hint="From openrouter.ai/keys.">
          <div className="relative">
            <Input
              type={show ? "text" : "password"}
              value={key}
              onChange={setKey}
              placeholder="sk-or-v1-…"
              mono
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-faint transition-colors hover:text-ink"
            >
              {show ? "Hide" : "Show"}
            </button>
          </div>
        </Field>

        {err && <Notice tone="danger">{err}</Notice>}

        <Button variant="primary" onClick={connect} disabled={busy || !key.trim()}>
          {busy ? "Connecting…" : "Connect"}
        </Button>
      </div>
    </div>
  );
}
