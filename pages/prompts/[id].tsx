// One prompt, in full: the answers each engine gave, what they cited, who they named.
//
// The aggregate views are useless at 0% visibility — every number is zero. This is where you
// find out WHY: which competitors own the answer and which pages the model trusts.
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import Layout from "@/components/Layout";
import { PageTitle, Card, EngineTag, Button, Chip } from "@/components/ui";

interface Citation {
  url: string;
  domain: string;
  is_self: number;
}
interface Mention {
  brand_id: string;
  name: string;
  is_self: number;
  position: number | null;
}
interface RunDetail {
  id: string;
  engine: string;
  sample_idx: number;
  answer: string;
  cost_usd: number;
  error: string | null;
  created_at: string;
  citations: Citation[];
  mentions: Mention[];
}
interface Detail {
  prompt: { id: string; text: string; tags: string[]; active: number } | null;
  runs: RunDetail[];
  topDomains: { domain: string; citations: number; is_self: number }[];
}

export default function PromptDetailPage() {
  const router = useRouter();
  const { id } = router.query;
  const [d, setD] = useState<Detail | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (typeof id !== "string") return;
    fetch(`/api/prompt-detail?id=${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(setD)
      .catch(() => setNotFound(true));
  }, [id]);

  if (notFound) {
    return (
      <Layout>
        <PageTitle>Prompt not found</PageTitle>
        <Link href="/prompts" className="text-sm text-accent">
          Back to prompts
        </Link>
      </Layout>
    );
  }

  const okRuns = d?.runs.filter((r) => !r.error) ?? [];
  const withMention = okRuns.filter((r) => r.mentions.some((m) => m.is_self)).length;
  const totalCost = d?.runs.reduce((s, r) => s + (r.cost_usd ?? 0), 0) ?? 0;

  return (
    <Layout>
      <div className="mb-1">
        <Link href="/prompts" className="text-xs text-muted hover:text-ink">
          ← Prompts
        </Link>
      </div>
      <PageTitle>{d?.prompt?.text ?? "Loading…"}</PageTitle>

      {d && (
        <>
          <div className="mb-4 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted">
            <span>
              <span className="text-ink">{okRuns.length}</span> answers
            </span>
            <span>
              mentioned you in <span className="text-ink">{withMention}</span> of them
            </span>
            <span>
              spent <span className="font-mono text-ink">${totalCost.toFixed(4)}</span>
            </span>
            {d.prompt?.tags.map((t) => <Chip key={t}>{t}</Chip>)}
          </div>

          {d.topDomains.length > 0 && (
            <div className="mb-4">
              <Card title="Most-cited sources for this prompt">
                <div className="space-y-1">
                  {d.topDomains.map((t) => (
                    <div key={t.domain} className="flex items-center gap-3 text-sm">
                      <span className="w-8 shrink-0 text-right font-mono text-xs text-muted">
                        {t.citations}
                      </span>
                      <span className={`truncate font-mono text-xs ${t.is_self ? "text-ok" : ""}`}>
                        {t.domain}
                        {t.is_self === 1 && <span className="ml-2 text-ok">you</span>}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 text-xs text-faint">
                  These are the pages the models lean on. Getting cited here, or displacing them,
                  is how the answer changes.
                </div>
              </Card>
            </div>
          )}

          <div className="mb-2 text-sm font-medium">Answers</div>
          {d.runs.length === 0 && (
            <Card>
              <div className="text-sm text-muted">
                No runs yet for this prompt. Run one from the Overview.
              </div>
            </Card>
          )}
          <div className="space-y-3">
            {d.runs.map((r) => (
              <RunCard key={r.id} run={r} />
            ))}
          </div>
        </>
      )}
    </Layout>
  );
}

function RunCard({ run }: { run: RunDetail }) {
  // Answers run 2,000–3,000 characters; showing them all at once rebuilds the wall of text
  // this page exists to avoid.
  const [open, setOpen] = useState(false);
  const long = run.answer.length > 420;
  const preview = long && !open ? run.answer.slice(0, 420).trimEnd() + "…" : run.answer;

  return (
    <div className="rounded-lg border border-line bg-panel">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
        <EngineTag id={run.engine} />
        <span className="font-mono text-xs text-faint">sample {run.sample_idx}</span>
        <span className="text-xs text-faint">{run.created_at}</span>
        <span className="ml-auto flex items-center gap-3 text-xs">
          <span className="text-muted">{run.citations.length} cited</span>
          <span className="font-mono text-faint">${(run.cost_usd ?? 0).toFixed(5)}</span>
        </span>
      </div>

      {run.error ? (
        <div className="px-4 py-3 text-xs text-danger">{run.error}</div>
      ) : (
        <>
          <div className="px-4 py-3">
            {run.mentions.length > 0 ? (
              <div className="mb-3 flex flex-wrap items-center gap-1">
                <span className="mr-1 text-xs text-muted">Named:</span>
                {run.mentions.map((m) => (
                  <span
                    key={m.brand_id}
                    className={`rounded px-1.5 py-0.5 text-xs ${
                      m.is_self ? "bg-accent/15 text-accent" : "bg-soft text-muted"
                    }`}
                  >
                    {m.position ? `${m.position}. ` : ""}
                    {m.name}
                  </span>
                ))}
              </div>
            ) : (
              <div className="mb-3 text-xs text-faint">
                None of your tracked brands were named in this answer.
              </div>
            )}

            <div className="whitespace-pre-wrap text-sm leading-relaxed text-ink/90">
              {preview}
            </div>
            {long && (
              <button
                onClick={() => setOpen((o) => !o)}
                className="mt-2 text-xs text-accent hover:underline"
              >
                {open ? "Show less" : "Show full answer"}
              </button>
            )}
          </div>

          {run.citations.length > 0 && (
            <div className="border-t border-line px-4 py-3">
              <div className="mb-1.5 text-xs text-muted">Sources cited</div>
              <div className="space-y-1">
                {run.citations.map((c, i) => (
                  <a
                    key={i}
                    href={c.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="block truncate font-mono text-xs text-faint hover:text-accent"
                    title={c.url}
                  >
                    <span className={c.is_self ? "text-ok" : "text-muted"}>{c.domain}</span>
                    <span className="ml-2">{c.url.replace(/^https?:\/\/[^/]+/, "") || "/"}</span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
