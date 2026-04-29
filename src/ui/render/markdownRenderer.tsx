import { useState, useRef, useCallback, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";

function CopyButton({ getText, label = "Copy" }: { getText: () => string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(getText());
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* noop — clipboard might be unavailable in webview */
    }
  }, [getText]);

  return (
    <button
      type="button"
      onClick={onCopy}
      className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white/80 px-2 py-0.5 text-[11px] font-medium text-ink-700 backdrop-blur transition-colors hover:bg-white hover:text-ink-900"
      aria-label={label}
    >
      {copied ? (
        <>
          <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M5 13l4 4L19 7" />
          </svg>
          Copied
        </>
      ) : (
        <>
          <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="9" y="9" width="11" height="11" rx="2" />
            <path d="M5 15V5a2 2 0 0 1 2-2h10" />
          </svg>
          {label}
        </>
      )}
    </button>
  );
}

function CodeBlock({ language, children }: { language: string | null; children: ReactNode }) {
  const ref = useRef<HTMLPreElement>(null);
  const getText = useCallback(() => ref.current?.innerText ?? "", []);

  return (
    <div className="group relative my-4 overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
      <div className="flex items-center justify-between border-b border-gray-200 bg-gray-100/70 px-3 py-1.5">
        <span className="font-mono text-[11px] uppercase tracking-wider text-ink-500">
          {language || "text"}
        </span>
        <div className="opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <CopyButton getText={getText} />
        </div>
      </div>
      <pre
        ref={ref}
        className="max-w-full overflow-x-auto p-4 text-[13px] leading-6 text-ink-800"
      >
        {children}
      </pre>
    </div>
  );
}

export default function MarkdownRenderer({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeHighlight]}
      components={{
        h1: (props) => <h1 className="mt-4 mb-1.5 text-[17px] font-semibold text-ink-900 leading-snug" {...props} />,
        h2: (props) => <h2 className="mt-3.5 mb-1 text-[15px] font-semibold text-ink-900 leading-snug" {...props} />,
        h3: (props) => <h3 className="mt-3 mb-1 text-[13px] font-semibold text-ink-800 leading-snug" {...props} />,
        h4: (props) => <h4 className="mt-2.5 mb-0.5 text-[12px] font-semibold text-ink-800" {...props} />,
        p: (props) => <p className="mt-0 mb-4 text-[15px] leading-[1.75] text-ink-800 last:mb-0" {...props} />,
        a: (props) => (
          <a
            {...props}
            target="_blank"
            rel="noreferrer noopener"
            className="font-medium text-[var(--color-accent)] underline decoration-[var(--color-accent)]/40 underline-offset-2 transition-colors hover:decoration-[var(--color-accent)]"
          />
        ),
        img: ({ alt, ...rest }) => (
          // eslint-disable-next-line jsx-a11y/alt-text
          <img
            alt={alt ?? ""}
            className="my-3 max-w-full rounded-lg border border-gray-200"
            {...rest}
          />
        ),
        ul: (props) => <ul className="mb-4 ml-5 list-disc space-y-1.5 text-[15px] text-ink-800 marker:text-ink-400" {...props} />,
        ol: (props) => <ol className="mb-4 ml-5 list-decimal space-y-1.5 text-[15px] text-ink-800 marker:text-ink-400" {...props} />,
        li: ({ children, ...props }) => (
          <li className="leading-[1.75] pl-0.5" {...props}>
            {children}
          </li>
        ),
        input: (props) =>
          props.type === "checkbox" ? (
            <input
              {...props}
              disabled
              className="mr-1.5 -translate-y-px align-middle accent-[var(--color-accent)]"
            />
          ) : (
            <input {...props} />
          ),
        strong: (props) => <strong className="font-semibold text-ink-900" {...props} />,
        em: (props) => <em className="italic text-ink-800" {...props} />,
        blockquote: (props) => (
          <blockquote
            className="my-4 border-l-4 border-[var(--color-accent)]/40 bg-gray-50/60 pl-4 py-2 text-[15px] leading-[1.75] text-ink-700 italic rounded-r-md"
            {...props}
          />
        ),
        hr: () => <hr className="my-6 border-t border-gray-200" />,
        pre: ({ children }) => {
          // Pull language out of the inner <code> if present.
          let language: string | null = null;
          if (
            children &&
            typeof children === "object" &&
            "props" in (children as object)
          ) {
            const codeProps = (children as { props?: { className?: string } }).props;
            const match = /language-(\w+)/.exec(codeProps?.className ?? "");
            if (match) language = match[1];
          }
          return <CodeBlock language={language}>{children}</CodeBlock>;
        },
        code: (props) => {
          const { children, className, ...rest } = props;
          const match = /language-(\w+)/.exec(className || "");
          const isInline = !match && !String(children).includes("\n");

          return isInline ? (
            <code
              className="rounded-md bg-gray-100 border border-gray-200 px-1.5 py-0.5 font-mono text-[13px] text-ink-800"
              {...rest}
            >
              {children}
            </code>
          ) : (
            <code className={`${className ?? ""} font-mono text-[13px]`} {...rest}>
              {children}
            </code>
          );
        },
        table: (props) => (
          <div className="my-4 w-full overflow-x-auto rounded-xl border border-gray-200">
            <table className="min-w-full text-[14px] text-ink-800 border-collapse" {...props} />
          </div>
        ),
        thead: (props) => <thead className="bg-gray-50 text-ink-900 font-semibold" {...props} />,
        th: (props) => <th className="px-4 py-2.5 text-left font-semibold border-b border-gray-200" {...props} />,
        td: (props) => <td className="px-4 py-2.5 border-b border-gray-100 last:border-b-0" {...props} />,
        tr: (props) => <tr className="hover:bg-gray-50/50 transition-colors" {...props} />,
      }}
    >
      {text}
    </ReactMarkdown>
  );
}
