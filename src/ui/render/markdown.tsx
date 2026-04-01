import { lazy, Suspense, useMemo } from "react";

const MarkdownRenderer = lazy(() => import("./markdownRenderer"));

function looksLikeMarkdown(text: string): boolean {
  return /(^#{1,6}\s)|(```)|(^>\s)|(^[-*+]\s)|(^\d+\.\s)|(`[^`]+`)|(\[[^\]]+\]\([^)]+\))/m.test(text);
}

export default function MDContent({ text }: { text: string }) {
  const value = String(text ?? "");
  const shouldUseMarkdown = useMemo(() => looksLikeMarkdown(value), [value]);

  if (!shouldUseMarkdown) {
    return <div className="whitespace-pre-wrap">{value}</div>;
  }

  return (
    <Suspense fallback={<div className="whitespace-pre-wrap">{value}</div>}>
      <MarkdownRenderer text={value} />
    </Suspense>
  );
}
