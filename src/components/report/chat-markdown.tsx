import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

/** Tailwind-styled renderers so assistant markdown matches the chat theme. */
const COMPONENTS: Components = {
  p: ({ children }) => <p className="leading-relaxed">{children}</p>,
  ul: ({ children }) => (
    <ul className="list-disc space-y-1 pl-5 leading-relaxed">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal space-y-1 pl-5 leading-relaxed">{children}</ol>
  ),
  li: ({ children }) => <li className="pl-0.5">{children}</li>,
  strong: ({ children }) => (
    <strong className="font-semibold text-[var(--foreground)]">{children}</strong>
  ),
  em: ({ children }) => <em className="italic">{children}</em>,
  h1: ({ children }) => (
    <h1 className="text-sm font-semibold text-[var(--foreground)]">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-sm font-semibold text-[var(--foreground)]">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-[13px] font-semibold text-[var(--foreground)]">{children}</h3>
  ),
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-[var(--primary)] underline underline-offset-2"
    >
      {children}
    </a>
  ),
  code: ({ children }) => (
    <code className="rounded bg-[var(--secondary)] px-1 py-0.5 font-mono text-[12px]">
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre className="overflow-x-auto rounded-md bg-[var(--secondary)] p-2 font-mono text-[12px]">
      {children}
    </pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-[var(--border)] pl-3 text-[var(--muted-foreground)]">
      {children}
    </blockquote>
  ),
};

/** Renders assistant chat text as GitHub-flavored markdown. */
export function ChatMarkdown({ children }: { children: string }) {
  return (
    <div className="space-y-2 text-sm leading-relaxed text-[var(--foreground)]">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
