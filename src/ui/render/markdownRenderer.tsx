import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";

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
        ul: (props) => <ul className="mb-4 ml-5 list-disc space-y-1.5 text-[15px] text-ink-800" {...props} />,
        ol: (props) => <ol className="mb-4 ml-5 list-decimal space-y-1.5 text-[15px] text-ink-800" {...props} />,
        li: (props) => <li className="leading-[1.75] pl-0.5" {...props} />,
        strong: (props) => <strong className="font-semibold text-ink-900" {...props} />,
        em: (props) => <em className="italic text-ink-800" {...props} />,
        blockquote: (props) => (
          <blockquote
            className="my-4 border-l-4 border-gray-200 pl-4 text-[15px] leading-[1.75] text-ink-600 italic"
            {...props}
          />
        ),
        hr: () => <hr className="my-6 border-t border-gray-200" />,
        pre: (props) => (
          <pre
            className="my-4 max-w-full overflow-x-auto rounded-xl bg-gray-50 border border-gray-200 p-4 text-[13px] leading-6 text-ink-800"
            {...props}
          />
        ),
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
