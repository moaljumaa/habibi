// Settings as a dialog with its own sidebar — Notion's pattern: the app stays visible behind,
// sections live in a rail on the left, one pane at a time on the right.
import { useEffect, useState, useCallback, ReactNode } from "react";
import { Button, Input, Field, Dot, Chip, Modal, Notice, useDialog } from "@/components/ui";
import VendorEngineCards from "@/components/VendorEngineCards";
import CostPanel, { type CostEstimate } from "@/components/CostPanel";

interface Brand {
  id: string;
  name: string;
  is_self: number;
  domains: string[];
}

interface Provider {
  id: string;
  configured: boolean;
  source: "db" | "env" | "none";
  hint: string | null;
  model: string | null;
  models: string[];
  enabled: boolean;
  undecryptable: boolean;
}

interface CatalogueModel {
  id: string;
  name: string;
  webSearchUsd: number | null;
}
interface CatalogueGroup {
  provider: string;
  models: CatalogueModel[];
}

const PROVIDER_META: Record<
  string,
  { label: string; note: string; placeholder: string; model: string }
> = {
  openrouter: {
    label: "OpenRouter",
    note: "One key, many models. Each model you pick is tracked separately.",
    placeholder: "sk-or-v1-…",
    model: "openai/gpt-5.2",
  },
  perplexity: {
    label: "Perplexity",
    note: "Sonar — grounded by default.",
    placeholder: "pplx-…",
    model: "sonar",
  },
  openai: {
    label: "OpenAI",
    note: "Responses API with the web search tool.",
    placeholder: "sk-…",
    model: "gpt-4o",
  },
  gemini: {
    label: "Gemini",
    note: "Google Search grounding.",
    placeholder: "AIza…",
    model: "gemini-2.0-flash",
  },
};

/** Upstream vendors write their own names; CSS `capitalize` turns "openai" into "Openai". */
const VENDOR_NAMES: Record<string, string> = {
  openai: "OpenAI",
  "x-ai": "xAI",
  deepseek: "DeepSeek",
  mistralai: "Mistral",
  "meta-llama": "Meta",
  openrouter: "OpenRouter",
  nousresearch: "Nous Research",
  "z-ai": "Z.ai",
  minimax: "MiniMax",
  moonshotai: "Moonshot",
  ai21: "AI21",
  liquid: "Liquid",
  nvidia: "NVIDIA",
  "aion-labs": "Aion Labs",
  thudm: "THUDM",
  inflection: "Inflection",
};

function vendorName(id: string): string {
  return VENDOR_NAMES[id] ?? id.charAt(0).toUpperCase() + id.slice(1);
}

const SECTIONS = [
  { id: "brands", label: "Brands", group: "Tracking" },
  { id: "prompts-info", label: "Run", group: "Tracking" },
  { id: "engines", label: "Engines", group: "Connections" },
] as const;
type SectionId = (typeof SECTIONS)[number]["id"];

export default function SettingsModal({ onClose }: { onClose: () => void }) {
  useDialog(onClose);

  const [section, setSection] = useState<SectionId>("brands");
  const [brands, setBrands] = useState<Brand[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [hasPremium, setHasPremium] = useState(true);
  const [samples, setSamples] = useState(3);
  const [cap, setCap] = useState(5);

  const load = useCallback(() => {
    fetch("/api/brands").then((r) => r.json()).then(setBrands);
    fetch("/api/providers").then((r) => r.json()).then(setProviders);
    fetch("/api/settings").then((r) => r.json()).then((s) => {
      setSamples(s.samples_per_prompt);
      setCap(s.daily_spend_cap_usd);
    });
  }, []);

  useEffect(() => {
    load();
    fetch("/api/premium-status")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setHasPremium(!!d.hasPremium))
      .catch(() => {});
  }, [load]);

  const connected = providers.filter((p) => p.configured).length;
  const groups = [...new Set(SECTIONS.map((s) => s.group))];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 sm:p-10"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        onClick={(e) => e.stopPropagation()}
        className="flex h-full max-h-[720px] w-full max-w-4xl overflow-hidden rounded-xl border border-line bg-bg shadow-2xl"
      >
        {/* Rail */}
        <aside className="hidden w-52 shrink-0 flex-col border-r border-line bg-panel px-2 py-4 sm:flex">
          {groups.map((g) => (
            <div key={g} className="mb-4">
              <div className="px-3 pb-1 text-xs font-medium text-faint">{g}</div>
              {SECTIONS.filter((s) => s.group === g).map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSection(s.id)}
                  className={`flex w-full items-center justify-between rounded-md px-3 py-1.5 text-left text-sm transition-colors ${
                    section === s.id
                      ? "bg-raised font-medium text-ink"
                      : "text-muted hover:bg-raised hover:text-ink"
                  }`}
                >
                  {s.label}
                  {s.id === "engines" && connected > 0 && (
                    <span className="font-mono text-xs text-faint">{connected}</span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </aside>

        {/* Pane */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* The pane's title lives with its description in the body, so this bar carries only
              the close affordance (and the section switcher once the rail is hidden). */}
          <div className="flex items-center justify-between gap-4 px-6 pt-4">
            <select
              value={section}
              onChange={(e) => setSection(e.target.value as SectionId)}
              className="rounded-md border border-line bg-panel px-2 py-1 text-sm sm:hidden"
            >
              {SECTIONS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
            <span className="hidden sm:block" />
            <button
              onClick={onClose}
              aria-label="Close settings"
              className="rounded p-1 text-muted transition-colors hover:bg-raised hover:text-ink"
            >
              ×
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 pb-6 pt-3">
            {section === "brands" && <BrandsSection brands={brands} reload={load} />}
            {section === "engines" && (
              <EnginesSection
                providers={providers}
                setProviders={setProviders}
                hasPremium={hasPremium}
              />
            )}
            {section === "prompts-info" && (
              <RunSection samples={samples} cap={cap} setSamples={setSamples} setCap={setCap} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Brands ──────────────────────────────────────────────────────────────────

function BrandsSection({ brands, reload }: { brands: Brand[]; reload: () => void }) {
  const [name, setName] = useState("");
  const [domains, setDomains] = useState("");
  const [isSelf, setIsSelf] = useState(false);
  const [adding, setAdding] = useState(false);
  const hasSelf = brands.some((b) => b.is_self);

  async function addBrand() {
    if (!name.trim()) return;
    await fetch("/api/brands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        is_self: isSelf,
        domains: domains.split(",").map((d) => d.trim()).filter(Boolean),
      }),
    });
    setName("");
    setDomains("");
    setIsSelf(false);
    setAdding(false);
    reload();
  }

  async function removeBrand(id: string) {
    await fetch("/api/brands", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    reload();
  }

  return (
    <section>
      <SectionHeader
        title="Brands"
        description="Your brand and the competitors you measure against."
        action={
          !adding && brands.length > 0 ? (
            <Button onClick={() => setAdding(true)}>Add brand</Button>
          ) : null
        }
      />

      {!hasSelf && brands.length > 0 && (
        <div className="mb-3">
          <Notice tone="danger">
            No brand is marked as yours, so runs can’t measure visibility.
          </Notice>
        </div>
      )}

      <div className="divide-y divide-line rounded-lg border border-line bg-panel">
        {brands.map((b) => (
          <div key={b.id} className="group flex items-center gap-3 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-sm">
                <span className="truncate">{b.name}</span>
                {b.is_self === 1 && (
                  <span className="rounded bg-accent/15 px-1.5 py-0.5 text-xs text-accent">You</span>
                )}
              </div>
              {b.domains.length > 0 && (
                <div className="mt-0.5 truncate font-mono text-xs text-faint">
                  {b.domains.join("  ")}
                </div>
              )}
            </div>
            <div className="opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
              <Button onClick={() => removeBrand(b.id)} variant="danger">
                Remove
              </Button>
            </div>
          </div>
        ))}

        {brands.length === 0 && !adding && (
          <div className="px-4 py-10 text-center">
            <div className="text-sm text-muted">Add your brand to start measuring visibility.</div>
            <div className="mt-3">
              <Button onClick={() => setAdding(true)} variant="primary">
                Add your brand
              </Button>
            </div>
          </div>
        )}

        {adding && (
          <div className="space-y-3 px-4 py-4">
            <Field label="Name">
              <Input value={name} onChange={setName} placeholder="Acme" autoFocus />
            </Field>
            <Field label="Domains" hint="Comma-separated. Used to mark citations as yours.">
              <Input
                value={domains}
                onChange={setDomains}
                placeholder="acme.com, blog.acme.com"
                mono
              />
            </Field>
            <label className="flex items-center gap-2 text-sm text-muted">
              <input
                type="checkbox"
                checked={isSelf}
                onChange={(e) => setIsSelf(e.target.checked)}
                disabled={hasSelf && !isSelf}
              />
              This is my brand
              {hasSelf && <span className="text-faint">— already set on another brand</span>}
            </label>
            <div className="flex gap-2">
              <Button onClick={addBrand} variant="primary" disabled={!name.trim()}>
                Add brand
              </Button>
              <Button onClick={() => setAdding(false)} variant="ghost">
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

// ─── Engines ─────────────────────────────────────────────────────────────────

function EnginesSection({
  providers,
  setProviders,
  hasPremium,
}: {
  providers: Provider[];
  setProviders: (p: Provider[]) => void;
  hasPremium: boolean;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [pickerFor, setPickerFor] = useState<Provider | null>(null);

  // Keep the picker bound to fresh data after a save.
  const picker = pickerFor ? providers.find((p) => p.id === pickerFor.id) ?? pickerFor : null;

  return (
    <section>
      <SectionHeader
        title="Engines"
        description="Keys are encrypted before they’re stored and never sent back to the browser."
      />

      <div className="divide-y divide-line rounded-lg border border-line bg-panel">
        {providers.map((p) => (
          <ProviderRow
            key={p.id}
            provider={p}
            open={openId === p.id}
            onToggle={() => setOpenId(openId === p.id ? null : p.id)}
            onSaved={setProviders}
            onChooseModels={() => setPickerFor(p)}
          />
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between rounded-lg border border-line bg-panel px-4 py-3">
        <div>
          <div className="text-sm">Google AI Overviews</div>
          <div className="mt-0.5 text-xs text-muted">
            No public API — needs SERP data, so it’s part of the hosted plan.
          </div>
        </div>
        {hasPremium ? (
          <span className="text-xs text-muted">Enabled</span>
        ) : (
          <a
            href="https://habibi.example?utm_source=oss&utm_medium=settings"
            className="rounded-md border border-line px-3 py-1.5 text-sm text-muted transition-colors hover:bg-raised hover:text-ink"
          >
            Upgrade
          </a>
        )}
      </div>

      {picker && (
        <ModelPicker
          provider={picker}
          onClose={() => setPickerFor(null)}
          onSaved={setProviders}
        />
      )}
    </section>
  );
}

function ProviderRow({
  provider,
  open,
  onToggle,
  onSaved,
  onChooseModels,
}: {
  provider: Provider;
  open: boolean;
  onToggle: () => void;
  onSaved: (next: Provider[]) => void;
  onChooseModels: () => void;
}) {
  const meta = PROVIDER_META[provider.id] ?? {
    label: provider.id,
    note: "",
    placeholder: "API key",
    model: "model name",
  };
  const [key, setKey] = useState("");
  const [model, setModel] = useState(provider.model ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const isMultiModel = provider.id === "openrouter";
  const fromEnv = provider.source === "env";

  async function post(method: "POST" | "DELETE", body: Record<string, unknown>) {
    setBusy(true);
    setErr("");
    const res = await fetch("/api/providers", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: provider.id, ...body }),
    });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) return setErr(data?.error ?? "Couldn’t save the key. Try again.");
    if (data?.providers) onSaved(data.providers);
    setKey("");
  }

  const status = provider.undecryptable
    ? { tone: "danger" as const, text: "Key unreadable" }
    : provider.configured
      ? { tone: "ok" as const, text: provider.hint ?? "Connected" }
      : { tone: "off" as const, text: "Not connected" };

  return (
    <div>
      <div className="flex items-center gap-3 px-4 py-3">
        <Dot tone={status.tone} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-sm">{meta.label}</span>
            <span
              className={`font-mono text-xs ${
                status.tone === "danger" ? "text-danger" : "text-faint"
              }`}
            >
              {status.text}
            </span>
            {fromEnv && <span className="text-xs text-faint">· from .env</span>}
          </div>
          <div className="mt-0.5 text-xs text-muted">{meta.note}</div>
        </div>

        <Button onClick={onToggle} variant="ghost">
          {open ? "Close" : provider.configured ? "Manage" : "Connect"}
        </Button>
      </div>

      {isMultiModel && provider.models.length > 0 && !open && (
        <div className="flex flex-wrap gap-1 px-4 pb-3 pl-10">
          {provider.models.slice(0, 5).map((m) => (
            <Chip key={m}>{m}</Chip>
          ))}
          {provider.models.length > 5 && (
            <span className="self-center text-xs text-faint">
              +{provider.models.length - 5} more
            </span>
          )}
        </div>
      )}

      {open && (
        <div className="space-y-3 border-t border-line bg-bg px-4 py-4">
          {provider.undecryptable && (
            <Notice tone="danger">
              This key can’t be decrypted — <code className="font-mono">HABIBI_SECRET_KEY</code>{" "}
              changed or <code className="font-mono">data/.secret</code> was lost. Enter the key
              again to fix it.
            </Notice>
          )}

          <Field
            label="API key"
            hint={fromEnv ? "Set in .env. Saving here overrides it." : undefined}
          >
            <Input
              type="password"
              value={key}
              onChange={setKey}
              placeholder={provider.configured ? "Enter a new key to replace" : meta.placeholder}
              mono
              autoFocus
            />
          </Field>

          {!isMultiModel && (
            <Field label="Model" hint={`Defaults to ${meta.model}.`}>
              <Input value={model} onChange={setModel} placeholder={meta.model} mono />
            </Field>
          )}

          {isMultiModel && provider.configured && (
            <div>
              <span className="mb-1 block text-xs font-medium text-muted">Engines</span>
              <VendorEngineCards
                selected={provider.models}
                onChange={async (models) => {
                  const res = await fetch("/api/providers", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id: provider.id, models }),
                  });
                  const data = await res.json().catch(() => null);
                  if (data?.providers) onSaved(data.providers);
                }}
              />
              <button
                onClick={onChooseModels}
                className="mt-2 text-xs text-muted underline transition-colors hover:text-ink"
              >
                Show all 300+ models →
              </button>
            </div>
          )}

          {err && <div className="text-xs text-danger">{err}</div>}

          <div className="flex items-center gap-2">
            <Button
              onClick={() =>
                post("POST", {
                  api_key: key || undefined,
                  model: isMultiModel ? undefined : model,
                })
              }
              variant="primary"
              disabled={busy || (!key && (isMultiModel || model === (provider.model ?? "")))}
            >
              Save
            </Button>
            {provider.source === "db" && (
              <Button onClick={() => post("DELETE", {})} variant="danger" disabled={busy}>
                Disconnect
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** The model catalogue, in its own dialog above Settings. 300+ models can't live inline. */
function ModelPicker({
  provider,
  onClose,
  onSaved,
}: {
  provider: Provider;
  onClose: () => void;
  onSaved: (next: Provider[]) => void;
}) {
  const [groups, setGroups] = useState<CatalogueGroup[]>([]);
  const [selected, setSelected] = useState<string[]>(provider.models);
  const [q, setQ] = useState("");
  const [loadErr, setLoadErr] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/openrouter-models")
      .then((r) => r.json())
      .then((d) =>
        d.groups ? setGroups(d.groups) : setLoadErr(d.error ?? "Couldn’t load the catalogue.")
      )
      .catch(() => setLoadErr("Couldn’t reach OpenRouter."));
  }, []);

  function toggle(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  async function save() {
    setSaving(true);
    const res = await fetch("/api/providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: provider.id, models: selected }),
    });
    const data = await res.json().catch(() => null);
    if (data?.providers) onSaved(data.providers);
    setSaving(false);
    onClose();
  }

  const needle = q.trim().toLowerCase();
  const filtered = needle
    ? groups
        .map((g) => ({
          ...g,
          models: g.models.filter(
            (m) => m.id.toLowerCase().includes(needle) || m.name.toLowerCase().includes(needle)
          ),
        }))
        .filter((g) => g.models.length)
    : groups;

  return (
    <Modal
      layer={60}
      title="Choose models"
      subtitle="Each model becomes its own tracked engine, sampled on every run."
      onClose={onClose}
      footer={
        <>
          <span className="mr-auto text-xs text-muted">{selected.length} selected</span>
          <Button onClick={onClose} variant="ghost">
            Cancel
          </Button>
          <Button onClick={save} variant="primary" disabled={saving}>
            Save models
          </Button>
        </>
      }
    >
      <div className="border-b border-line px-5 py-3">
        <Input value={q} onChange={setQ} placeholder="Search 300+ models…" autoFocus />
        {selected.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {selected.map((id) => (
              <Chip key={id} onRemove={() => toggle(id)}>
                {id}
              </Chip>
            ))}
          </div>
        )}
      </div>

      {loadErr && (
        <div className="px-5 py-4">
          <Notice tone="danger">{loadErr}</Notice>
        </div>
      )}
      {!loadErr && !groups.length && (
        <div className="px-5 py-10 text-center text-sm text-muted">Loading models…</div>
      )}
      {!loadErr && groups.length > 0 && !filtered.length && (
        <div className="px-5 py-10 text-center text-sm text-muted">No model matches “{q}”.</div>
      )}

      {filtered.map((g) => (
        <div key={g.provider}>
          <div className="sticky top-0 z-10 border-y border-line bg-raised px-5 py-1.5 text-xs font-medium text-muted">
            {vendorName(g.provider)}
            <span className="ml-2 font-mono text-faint">{g.models.length}</span>
          </div>
          {g.models.map((m) => {
            const on = selected.includes(m.id);
            return (
              <label
                key={m.id}
                className={`flex cursor-pointer items-center gap-3 px-5 py-2 transition-colors hover:bg-raised ${
                  on ? "bg-accent/10" : ""
                }`}
              >
                <input type="checkbox" checked={on} onChange={() => toggle(m.id)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{m.name}</span>
                  <span className="block truncate font-mono text-xs text-faint">{m.id}</span>
                </span>
                {m.webSearchUsd != null && (
                  <span
                    className="shrink-0 font-mono text-xs text-faint"
                    title="Native web search, per request"
                  >
                    ${m.webSearchUsd}
                  </span>
                )}
              </label>
            );
          })}
        </div>
      ))}
    </Modal>
  );
}

// ─── Run ─────────────────────────────────────────────────────────────────────

function RunSection({
  samples,
  cap,
  setSamples,
  setCap,
}: {
  samples: number;
  cap: number;
  setSamples: (n: number) => void;
  setCap: (n: number) => void;
}) {
  const [saved, setSaved] = useState(false);
  const [est, setEst] = useState<CostEstimate | null>(null);

  // Re-price as the sample count changes, so the cost of the choice is visible while making it.
  useEffect(() => {
    const n = Math.max(1, samples || 1);
    fetch(`/api/cost-estimate?samples=${n}`)
      .then((r) => r.json())
      .then(setEst)
      .catch(() => {});
  }, [samples]);

  async function save() {
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ samples_per_prompt: samples, daily_spend_cap_usd: cap }),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <section>
      <SectionHeader
        title="Run"
        description="How often each prompt is sampled, and the spend ceiling."
      />

      <div className="space-y-4 rounded-lg border border-line bg-panel p-4">
        <Field
          label="Samples per prompt"
          hint="Repeats each prompt within a single run. Daily runs already build a rate over time, so 1 is usually enough — raise it only for prompts where you're on the edge of being mentioned."
        >
          <Input type="number" value={String(samples)} onChange={(v) => setSamples(Number(v))} />
        </Field>

        {est && <CostPanel est={est} />}

        <Field label="Daily spend cap (USD)" hint="A run stops once the day’s spend reaches this.">
          <Input type="number" value={String(cap)} onChange={(v) => setCap(Number(v))} />
        </Field>

        <div className="flex items-center gap-3">
          <Button onClick={save} variant="primary">
            Save
          </Button>
          {saved && <span className="text-xs text-ok">Saved</span>}
        </div>
      </div>
    </section>
  );
}

// ─── Shared ──────────────────────────────────────────────────────────────────

function SectionHeader({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div>
        <h3 className="text-base font-medium">{title}</h3>
        <p className="mt-0.5 text-sm text-muted">{description}</p>
      </div>
      {action}
    </div>
  );
}
