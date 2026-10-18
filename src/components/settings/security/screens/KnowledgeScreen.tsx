"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { handbookArticle, handbookArticles } from "@/lib/security/handbook";
import { Panel } from "../../settings-ui";

/** Settings › Kiến thức bảo mật hữu ích. One article, or the library list. */
export function KnowledgeScreen() {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    setId(new URLSearchParams(window.location.search).get("article"));
  }, []);
  const article = id ? handbookArticle(id) : null;
  if (article) {
    return (
      <Panel title={article.title}>
        <ol className="list-decimal space-y-3 py-4 pl-5 text-sm leading-relaxed">
          {article.summary.map(line => <li key={line}>{line}</li>)}
        </ol>
        <p className="pb-4 text-sm leading-relaxed text-muted">{article.body}</p>
        <Link href="/settings/knowledge" className="mb-4 inline-block text-sm font-semibold text-primary">Các bài khác</Link>
      </Panel>
    );
  }
  return (
    <Panel title="Cẩm nang bảo mật">
      {handbookArticles().map(item => (
        <Link key={item.id} href={`/settings/knowledge?article=${item.id}`} className="settings-row">
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">{item.title}</span>
            <span className="mt-1 block text-sm font-normal leading-relaxed text-muted">{item.summary[0]}</span>
          </span>
        </Link>
      ))}
    </Panel>
  );
}
