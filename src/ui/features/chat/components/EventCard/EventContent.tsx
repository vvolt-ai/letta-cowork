/**
 * EventContent - Content display components for different message types
 */

import { useEffect, useRef, useState, type ReactNode } from "react";

import { HeaderLabel, StatusDot } from "./EventHeader";
import { setToolStatus } from "./hooks/useEventCard";

import type { SDKToolResultMessage, SDKAssistantMessage, SDKReasoningMessage } from "../../../../types";

// ============================================================================
// Utility Functions
// ============================================================================

const MAX_VISIBLE_LINES = 3;

type JsonRecord = Record<string, unknown>;

type GitDiffSummaryOutput = {
  repoRoot: string;
  stat?: string;
  files?: string;
  diff?: string;
};

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseJsonRecord(content: string): JsonRecord | null {
  try {
    const parsed = JSON.parse(content) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function parseGitDiffSummary(parsed: JsonRecord | null): GitDiffSummaryOutput | null {
  if (
    parsed &&
    typeof parsed.repoRoot === "string" &&
    (typeof parsed.diff === "string" || typeof parsed.stat === "string" || typeof parsed.files === "string")
  ) {
    return {
      repoRoot: parsed.repoRoot,
      stat: typeof parsed.stat === "string" ? parsed.stat : undefined,
      files: typeof parsed.files === "string" ? parsed.files : undefined,
      diff: typeof parsed.diff === "string" ? parsed.diff : undefined,
    };
  }
  return null;
}

function DiffLine({ line }: { line: string }) {
  const color = line.startsWith("+") && !line.startsWith("+++")
    ? "text-emerald-700 bg-emerald-50"
    : line.startsWith("-") && !line.startsWith("---")
      ? "text-red-700 bg-red-50"
      : line.startsWith("@@")
        ? "text-blue-700 bg-blue-50"
        : line.startsWith("diff --git") || line.startsWith("index ") || line.startsWith("+++") || line.startsWith("---")
          ? "text-purple-700 bg-purple-50"
          : "text-ink-700";

  return <div className={`min-w-max px-2 ${color}`}>{line || " "}</div>;
}

function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-[var(--color-tool-border)] bg-[var(--color-surface)] p-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">{title}</div>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function formatJsonValue(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value, null, 2);
}

function KeyValueGrid({ data, omit = [] }: { data: JsonRecord; omit?: string[] }) {
  const entries = Object.entries(data).filter(([key]) => !omit.includes(key));
  if (entries.length === 0) return null;
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {entries.map(([key, value]) => (
        <div key={key} className="rounded-md bg-[var(--color-tool-bg)] px-2.5 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">{key}</div>
          <pre className="mt-1 max-h-36 overflow-auto whitespace-pre-wrap break-words font-mono text-xs text-ink-800">{formatJsonValue(value)}</pre>
        </div>
      ))}
    </div>
  );
}

function OutputBlock({ title = "Output", value }: { title?: string; value: unknown }) {
  const text = formatJsonValue(value);
  if (!text || text === "—") return null;
  return (
    <SectionCard title={title}>
      <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap break-words rounded-md bg-[var(--color-tool-bg)] p-2 font-mono text-xs leading-5 text-ink-800">{text}</pre>
    </SectionCard>
  );
}

function GitDiffSummaryCard({ summary }: { summary: GitDiffSummaryOutput }) {
  const diffLines = (summary.diff ?? "").split("\n");
  return (
    <div className="space-y-3 text-sm text-ink-800">
      <SectionCard title="Repository">
        <div className="break-all font-mono text-xs text-ink-700">{summary.repoRoot}</div>
      </SectionCard>

      {summary.files ? (
        <SectionCard title="Files">
          <pre className="whitespace-pre-wrap font-mono text-xs text-ink-800">{summary.files}</pre>
        </SectionCard>
      ) : null}

      {summary.stat ? (
        <SectionCard title="Stat">
          <pre className="whitespace-pre-wrap font-mono text-xs text-ink-800">{summary.stat}</pre>
        </SectionCard>
      ) : null}

      {summary.diff ? (
        <details className="rounded-lg border border-[var(--color-tool-border)] bg-[var(--color-surface)]" open>
          <summary className="cursor-pointer px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted hover:text-ink-700">
            Diff
          </summary>
          <div className="max-h-[520px] overflow-auto border-t border-[var(--color-tool-border)] bg-[var(--color-tool-bg)] py-2 font-mono text-xs leading-5">
            {diffLines.map((line, index) => <DiffLine key={`${index}-${line.slice(0, 24)}`} line={line} />)}
          </div>
        </details>
      ) : null}
    </div>
  );
}

function StructuredJsonCard({ data }: { data: JsonRecord }) {
  const isCommandResult = typeof data.command === "string" || typeof data.status === "string" || typeof data.durationMs === "number";
  const isProjectSummary = typeof data.repoRoot === "string" || typeof data.cwd === "string" || typeof data.packageManager === "string";
  const outputKeys = ["output", "diff", "stat", "files", "message"];
  const presentOutputKeys = outputKeys.filter((key) => key in data);
  const title = isCommandResult ? "Command result" : isProjectSummary ? "Project result" : "Structured result";

  return (
    <div className="space-y-3 text-sm text-ink-800">
      <SectionCard title={title}>
        <KeyValueGrid data={data} omit={[...outputKeys, "scripts", "frameworks", "importantDirs", "memoryFiles"]} />
      </SectionCard>

      {Array.isArray(data.frameworks) ? <OutputBlock title="Frameworks" value={data.frameworks} /> : null}
      {Array.isArray(data.importantDirs) ? <OutputBlock title="Important directories" value={data.importantDirs} /> : null}
      {Array.isArray(data.memoryFiles) ? <OutputBlock title="Memory files" value={data.memoryFiles} /> : null}
      {isRecord(data.scripts) ? <OutputBlock title="Scripts" value={data.scripts} /> : null}
      {presentOutputKeys.map((key) => <OutputBlock key={key} title={key} value={data[key]} />)}
    </div>
  );
}

export function isMarkdown(text: string): boolean {
  if (!text || typeof text !== "string") return false;
  const patterns: RegExp[] = [/^#{1,6}\s+/m, /```[\s\S]*?```/];
  return patterns.some((pattern) => pattern.test(text));
}

export function extractTagContent(input: string, tag: string): string | null {
  const match = input.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return match ? match[1] : null;
}

// ============================================================================
// Tool Result Card
// ============================================================================

export interface ToolResultCardProps {
  message: SDKToolResultMessage;
}

export const ToolResultCard = ({ message }: ToolResultCardProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const isFirstRender = useRef(true);

  const isError = message.isError;
  const parsedJson = !isError ? parseJsonRecord(message.content) : null;
  const gitDiffSummary = parseGitDiffSummary(parsedJson);
  const structuredJson = parsedJson && !gitDiffSummary ? parsedJson : null;
  let lines: string[];

  if (isError) {
    lines = [extractTagContent(message.content, "tool_use_error") || message.content];
  } else {
    lines = message.content.split("\n");
  }

  const isMarkdownContent = isMarkdown(lines.join("\n"));
  const hasMoreLines = lines.length > MAX_VISIBLE_LINES;
  const visibleContent =
    hasMoreLines && !isExpanded
      ? lines.slice(0, MAX_VISIBLE_LINES).join("\n")
      : lines.join("\n");

  useEffect(() => {
    setToolStatus(message.toolCallId, isError ? "error" : "success");
  }, [message.toolCallId, isError]);

  useEffect(() => {
    if (!hasMoreLines || isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [hasMoreLines, isExpanded]);

  // Dynamic import to avoid circular dependency
  const MDContent = require("../../../../render/markdown").default;

  return (
    <div className="flex flex-col mt-4">
      <div className="header text-accent">Output</div>
      <div className="mt-2 rounded-xl bg-surface-tertiary p-3">
        {gitDiffSummary ? (
          <GitDiffSummaryCard summary={gitDiffSummary} />
        ) : structuredJson ? (
          <StructuredJsonCard data={structuredJson} />
        ) : (
          <pre
            className={`text-sm whitespace-pre-wrap break-words font-mono ${isError ? "text-red-500" : "text-ink-700"}`}
          >
            {isMarkdownContent ? <MDContent text={visibleContent} /> : visibleContent}
          </pre>
        )}
        {!gitDiffSummary && !structuredJson && hasMoreLines && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="mt-2 text-sm text-accent hover:text-accent-hover transition-colors flex items-center gap-1"
          >
            <span>{isExpanded ? "▲" : "▼"}</span>
            <span>
              {isExpanded ? "Collapse" : `Show ${lines.length - MAX_VISIBLE_LINES} more lines`}
            </span>
          </button>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
};

// ============================================================================
// Assistant Card
// ============================================================================

export interface AssistantCardProps {
  message: SDKAssistantMessage;
  showIndicator?: boolean;
  agentName?: string;
}

export const AssistantCard = ({
  message,
  showIndicator = false,
  agentName,
}: AssistantCardProps) => {
  const MDContent = require("../../../../render/markdown").default;

  return (
    <div className="flex flex-col mt-4">
      <div className="header text-accent flex items-center gap-2">
        <StatusDot variant="success" isActive={showIndicator} isVisible={showIndicator} />
        {agentName || "Assistant"}
      </div>
      <MDContent text={message.content} />
    </div>
  );
};

// ============================================================================
// Reasoning Card
// ============================================================================

export interface ReasoningCardProps {
  message: SDKReasoningMessage;
  showIndicator?: boolean;
}

export const ReasoningCard = ({ message, showIndicator = false }: ReasoningCardProps) => {
  const MDContent = require("../../../../render/markdown").default;

  return (
    <div className="flex flex-col mt-4">
      <HeaderLabel
        label="Thinking"
        variant="success"
        isActive={showIndicator}
        showIndicator={showIndicator}
      />
      <MDContent text={message.content} />
    </div>
  );
};
