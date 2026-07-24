// components/onboarding/StepScrape.tsx — step 2: the user's URL, rendered + read by an LLM to
// draft a brand profile. A bad/unreachable URL never hard-blocks onboarding — "skip" advances
// with blank fields the user fills in themselves at step 3.
import { useState } from "react";
import { Button, Field, Input, Notice } from "@/components/ui";
import type { DraftedBrandProfile } from "@/lib/brandProfile";

export type ScrapedProfile = DraftedBrandProfile & { url: string };

const EMPTY_DRAFT: DraftedBrandProfile = {
  name: "",
  description: "",
  industry: "",
  adjectives: [],
  products: [],
};

export default function StepScrape({
  onDone,
}: {
  onDone: (profile: ScrapedProfile) => void;
}) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function analyze() {
    setBusy(true);
    setErr("");
    const res = await fetch("/api/onboarding/scrape-brand", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (data?.ok) return onDone({ ...data.profile, url });
    setErr(data?.error ?? "Couldn't analyze that site.");
  }

  function skip() {
    onDone({ ...EMPTY_DRAFT, url });
  }

  if (busy) {
    return (
      <div>
        <h1 className="text-xl font-medium text-ink">Analyzing your site</h1>
        <p className="mt-1 text-sm text-muted">
          Reading <span className="font-mono text-ink">{url}</span> to draft a brand profile…
        </p>
        <div className="mt-6 space-y-2">
          {[100, 88, 92, 70, 84].map((w, i) => (
            <div
              key={i}
              className="h-3 animate-pulse rounded bg-soft"
              style={{ width: `${w}%` }}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-medium text-ink">What's your website?</h1>
      <p className="mt-1 text-sm text-muted">
        We'll read the page and draft a brand profile — you can edit everything on the next step.
      </p>

      <div className="mt-6 space-y-3">
        <Field label="Website URL">
          <Input
            value={url}
            onChange={setUrl}
            placeholder="https://acme.com"
            autoFocus
          />
        </Field>

        {err && (
          <Notice tone="danger">
            {err}{" "}
            <button onClick={skip} className="underline hover:text-ink">
              Skip — I'll fill this in myself
            </button>
          </Notice>
        )}

        <Button variant="primary" onClick={analyze} disabled={!url.trim()}>
          Continue
        </Button>
      </div>
    </div>
  );
}
