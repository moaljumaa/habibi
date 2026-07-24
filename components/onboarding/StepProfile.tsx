// components/onboarding/StepProfile.tsx — step 3: the AI draft, fully editable. Left = form,
// right = live preview, mirroring the Peec AI reference. Submitting creates the self brand.
import { useState, KeyboardEvent } from "react";
import { Button, Card, Chip, Field, Input, Notice } from "@/components/ui";
import type { ScrapedProfile } from "./StepScrape";

export default function StepProfile({
  draft,
  onBack,
  onDone,
}: {
  draft: ScrapedProfile | null;
  onBack: () => void;
  onDone: () => void;
}) {
  const [name, setName] = useState(draft?.name ?? "");
  const [description, setDescription] = useState(draft?.description ?? "");
  const [industry, setIndustry] = useState(draft?.industry ?? "");
  const [adjectives, setAdjectives] = useState<string[]>(draft?.adjectives ?? []);
  const [products, setProducts] = useState<string[]>(draft?.products ?? []);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    if (!name.trim()) return setErr("Give your brand a name.");
    setBusy(true);
    setErr("");
    const res = await fetch("/api/brands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        is_self: true,
        description,
        industry,
        adjectives,
        products,
        url: draft?.url ?? "",
      }),
    });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) return setErr(data?.error ?? "Couldn't save your brand. Try again.");
    onDone();
  }

  return (
    <div>
      <h1 className="text-xl font-medium text-ink">Verify your brand profile</h1>
      <p className="mt-1 text-sm text-muted">
        Edit anything that's off — this becomes the context we give the AI models later.
      </p>

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <div className="space-y-3">
          <Field label="Name">
            <Input value={name} onChange={setName} placeholder="Acme" autoFocus />
          </Field>
          <Field label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="What your brand does, for whom."
              className="w-full rounded-md border border-line bg-bg px-3 py-1.5 text-sm text-ink transition-colors placeholder:text-faint hover:border-faint focus:border-accent focus:outline-none"
            />
          </Field>
          <Field label="Industry">
            <Input value={industry} onChange={setIndustry} placeholder="AI consulting" />
          </Field>
          <ChipField label="Brand identity" hint="Adjectives that describe your brand." items={adjectives} setItems={setAdjectives} placeholder="Add an adjective" />
          <ChipField label="Products & services" hint="What your brand offers." items={products} setItems={setProducts} placeholder="Add a product" />
        </div>

        <Card title="Preview">
          <div className="text-sm font-medium">{name || "Your brand"}</div>
          {industry && <div className="mt-0.5 text-xs text-muted">{industry}</div>}
          {description && <p className="mt-3 text-sm text-muted">{description}</p>}
          {adjectives.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1">
              {adjectives.map((a) => (
                <Chip key={a}>{a}</Chip>
              ))}
            </div>
          )}
          {products.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1">
              {products.map((p) => (
                <Chip key={p}>{p}</Chip>
              ))}
            </div>
          )}
        </Card>
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
        <Button variant="primary" onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Next"}
        </Button>
      </div>
    </div>
  );
}

function ChipField({
  label,
  hint,
  items,
  setItems,
  placeholder,
}: {
  label: string;
  hint: string;
  items: string[];
  setItems: (items: string[]) => void;
  placeholder: string;
}) {
  const [draft, setDraft] = useState("");

  function add() {
    const v = draft.trim();
    if (v && !items.includes(v)) setItems([...items, v]);
    setDraft("");
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      add();
    }
  }

  return (
    <Field label={label} hint={hint}>
      <div className="flex flex-wrap gap-1.5 rounded-md border border-line bg-bg p-2">
        {items.map((item) => (
          <Chip key={item} onRemove={() => setItems(items.filter((i) => i !== item))}>
            {item}
          </Chip>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={add}
          placeholder={placeholder}
          className="min-w-[8rem] flex-1 bg-transparent px-1 py-0.5 text-sm text-ink placeholder:text-faint focus:outline-none"
        />
      </div>
    </Field>
  );
}
