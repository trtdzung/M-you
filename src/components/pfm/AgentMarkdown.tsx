import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Renders an agent reply as markdown (the real M-You agent frequently answers
 * with GFM tables and bold text, e.g. jar/card breakdowns). `react-markdown`
 * parses into a safe React element tree — no `dangerouslySetInnerHTML`, no raw
 * HTML plugin — so agent-generated text can never inject markup. Colors are
 * left unset here so every element inherits the chat bubble's own text color
 * (normal vs. error bubble).
 */
export function AgentMarkdown({ text }: { text: string }) {
  return (
    <div className="[&>*:last-child]:mb-0">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="mb-2 whitespace-pre-wrap">{children}</p>,
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          ul: ({ children }) => <ul className="mb-2 list-disc pl-4">{children}</ul>,
          ol: ({ children }) => <ol className="mb-2 list-decimal pl-4">{children}</ol>,
          li: ({ children }) => <li className="mb-0.5">{children}</li>,
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className="underline">
              {children}
            </a>
          ),
          code: ({ children }) => <code className="rounded bg-black/10 px-1 py-0.5 text-[13px]">{children}</code>,
          table: ({ children }) => (
            <div className="mb-2 overflow-x-auto">
              <table className="w-full border-collapse text-xs">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-current/15 px-2 py-1 text-left font-semibold">{children}</th>
          ),
          td: ({ children }) => <td className="border border-current/15 px-2 py-1">{children}</td>,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
