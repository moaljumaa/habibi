import { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import { Card, PageTitle, EngineTag } from "@/components/ui";

interface SelfCitation {
  url: string;
  domain: string;
  engine: string;
  prompt_id: string;
  prompt_text: string;
  count: number;
}

export default function Citations() {
  const [rows, setRows] = useState<SelfCitation[]>([]);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then((d) => setRows(d.selfCitations))
      .catch(() => {});
  }, []);

  return (
    <Layout>
      <PageTitle>Citations</PageTitle>
      <p className="mb-4 text-sm text-muted">
        Which of your pages got pulled as a source, for which prompt, on which engine. This is
        the page-level mapping — double down on what’s working.
      </p>

      <Card>
        {rows.length === 0 ? (
          <div className="text-sm text-muted">
            No citations of your domains yet. Make sure your domains are set in Settings, then run.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="py-2 font-normal">Your page</th>
                <th className="py-2 font-normal">Engine</th>
                <th className="py-2 font-normal">For prompt</th>
                <th className="py-2 font-normal text-right">Times cited</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-line align-top">
                  <td className="py-2 pr-4">
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-ink underline decoration-line hover:decoration-ink break-all"
                    >
                      {r.url}
                    </a>
                  </td>
                  <td className="py-2 pr-4">
                    <EngineTag id={r.engine} />
                  </td>
                  <td className="py-2 pr-4 text-muted">{r.prompt_text}</td>
                  <td className="py-2 text-right">{r.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </Layout>
  );
}
