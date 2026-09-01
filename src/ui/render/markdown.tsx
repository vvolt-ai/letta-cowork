import { lazy, Suspense, useMemo } from "react";

const loadMarkdownRenderer = () => import("./markdownRenderer");
const MarkdownRenderer = lazy(loadMarkdownRenderer);

export function preloadMarkdownRenderer(): void {
  void loadMarkdownRenderer();
}
// Very large Markdown documents can create thousands of DOM nodes and stall
// lower-powered Windows renderers. Keep the response readable as plain text.
const MAX_RICH_MARKDOWN_LENGTH = 80_000;

export function looksLikeMarkdown(text: string): boolean {
  return /(^#{1,6}\s)|(```)|(^>\s)|(^[-*+]\s)|(^\d+\.\s)|(`[^`]+`)|(\[[^\]]+\]\([^)]+\))|(^\s*\|.+\|\s*$)|(\*\*[^*\n]+\*\*)|(__[^_\n]+__)/m.test(text);
}

export default function MDContent({ text }: { text: string }) {
  const value = String(text ?? "");
  const shouldUseMarkdown = useMemo(() => value.length <= MAX_RICH_MARKDOWN_LENGTH && looksLikeMarkdown(value), [value]);

  if (!shouldUseMarkdown) {
    return <div className="whitespace-pre-wrap">{value}</div>;
  }

  return (
    <Suspense fallback={<div className="whitespace-pre-wrap">{value}</div>}>
      <MarkdownRenderer text={value} />
    </Suspense>
  );
}
