import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import Layout from "@/components/Layout";
import { Card, PageTitle, EngineTag } from "@/components/ui";

interface Prompt {
  id: string;
  text: string;
  tags: string[];
  active: number;
}
interface Rate {
  prompt_id: string;
  engine: string;
  rate: number;
  samples: number;
}

export default function Prompts() {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [rates, setRates] = useState<Rate[]>([]);
  const [engines, setEngines] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [tags, setTags] = useState("");

  const load = useCallback(() => {
    fetch("/api/prompts").then((r) => r.json()).then(setPrompts);
    fetch("/api/dashboard").then((r) => r.json()).then((d) => {
      setRates(d.promptEngineRates);
      setEngines(d.engines);
    });
  }, []);
  useEffect(() => load(), [load]);

  async function add() {
    if (!text.trim()) return;
    await fetch("/api/prompts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      }),
    });
    setText("");
    setTags("");
    load();
  }
  async function toggle(p: Prompt) {
    await fetch("/api/prompts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: p.id, active: !p.active }),
    });
    load();
  }
  async function remove(id: string) {
    await fetch("/api/prompts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    load();
  }

  const rateFor = (pid: string, eng: string) =>
    rates.find((r) => r.prompt_id === pid && r.engine === eng);

  return (
    <Layout>
      <PageTitle>Prompts</PageTitle>

      <Card title="Add a prompt">
        <div className="space-y-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g. Best CRM for marketing agencies under 50 people?"
            className="w-full rounded-md border border-line px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="tags, comma-separated (e.g. BOFU, agencies)"
              className="flex-1 rounded-md border border-line px-3 py-2 text-sm"
            />
            <button onClick={add} className="rounded-md bg-ink px-4 text-sm text-white">
              Add
            </button>
          </div>
        </div>
      </Card>

      <div className="mt-4">
        <Card title="Tracked prompts">
          {prompts.length === 0 ? (
            <div className="text-sm text-muted">No prompts yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="py-2 font-normal">Prompt</th>
                  {engines.map((e) => (
                    <th key={e} className="py-2 font-normal text-center">
                      <EngineTag id={e} />
                    </th>
                  ))}
                  <th />
                </tr>
              </thead>
              <tbody>
                {prompts.map((p) => (
                  <tr key={p.id} className="border-t border-line align-top">
                    <td className="py-2 pr-4">
                      {/* The rate is the summary; the answers behind it are the actual work. */}
                      <Link
                        href={`/prompts/${p.id}`}
                        className={
                          "hover:text-accent " + (p.active ? "" : "text-muted line-through")
                        }
                      >
                        {p.text}
                      </Link>
                      {p.tags.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {p.tags.map((t) => (
                            <span key={t} className="rounded bg-soft px-1.5 py-0.5 text-xs text-muted">
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    {engines.map((e) => {
                      const r = rateFor(p.id, e);
                      return (
                        <td key={e} className="py-2 text-center">
                          {r ? (
                            <span title={`${r.samples} samples`}>
                              {(r.rate * 100).toFixed(0)}%
                            </span>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="py-2 text-right whitespace-nowrap">
                      <button onClick={() => toggle(p)} className="text-xs text-muted mr-3">
                        {p.active ? "Pause" : "Resume"}
                      </button>
                      <button onClick={() => remove(p.id)} className="text-xs text-muted">
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="mt-3 text-xs text-muted">
            Percentages = share of samples (last 30 days) where you were mentioned.
          </div>
        </Card>
      </div>
    </Layout>
  );
}
