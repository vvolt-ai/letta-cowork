/**
 * Skill runner — loads the body of a SKILL.md from local disk on
 * demand. The agent calls `Skill({ name: "cowork-server-api" })` and
 * gets the prose back; no need to keep skill content in memory blocks.
 *
 * Lookup order:
 *   1. <project>/skills/<name>/SKILL.md      — repo-local skills
 *   2. ~/.letta/skills/<name>/SKILL.md       — global skills
 *
 * Returns the markdown body (sans frontmatter) trimmed.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import type { Dirent } from "fs";
import { homedir } from "os";
import { dirname, join } from "path";

import type {
    ClientToolDefinition,
    ToolRunContext,
    ToolRunResult,
} from "../types.js";

export const skillTool: ClientToolDefinition = {
    name: "Skill",
    description:
        "Load a skill's instructions on demand. Skills are markdown documents " +
        "(SKILL.md) under ~/.letta/skills/<name>/ or <project>/skills/<name>/. " +
        "Call this when the user's request maps to a known skill (e.g. " +
        "'cowork-server-api', 'email-processing', 'cowork-emails'). The returned " +
        "text contains the workflow you should follow. Call list_skills() first " +
        "if you don't know what's available.",
    parameters: {
        type: "object",
        properties: {
            name: {
                type: "string",
                description: "The skill id, e.g. 'cowork-server-api'.",
            },
        },
        required: ["name"],
    },
    run: async (args, ctx) => loadSkill(args, ctx),
};

/** A companion tool that lists available skills with their descriptions. */
export const listSkillsTool: ClientToolDefinition = {
    name: "list_skills",
    description:
        "List the skills available on this device, with each skill's description. " +
        "Use this to discover what's available before calling Skill(name).",
    parameters: { type: "object", properties: {} },
    run: async (_args, ctx) => listSkills(ctx),
};

// ─────────────────────────────────────────────────────────────────────
// Implementation
// ─────────────────────────────────────────────────────────────────────

function getSkillRoots(ctx?: ToolRunContext): Array<{ root: string; source: string }> {
    const out: Array<{ root: string; source: string }> = [];
    const seen = new Set<string>();
    const add = (root: string, source: string) => {
        if (!seen.has(root) && existsSync(root)) {
            seen.add(root);
            out.push({ root, source });
        }
    };
    add(join(process.cwd(), "skills"), "project");
    const memoryDir =
        process.env.MEMORY_DIR ||
        (ctx?.agentId
            ? join(homedir(), ".letta", "agents", ctx.agentId, "memory")
            : "");
    if (memoryDir) add(join(memoryDir, "skills"), "agent-memory");
    add(join(homedir(), ".letta", "skills"), "global");
    return out;
}

function findSkillPath(
    name: string,
    ctx?: ToolRunContext
): { path: string; source: string } | null {
    const sanitized = name.replace(/[^a-zA-Z0-9_-]/g, "");
    if (!sanitized) return null;
    for (const { root, source } of getSkillRoots(ctx)) {
        const candidate = join(root, sanitized, "SKILL.md");
        if (existsSync(candidate)) return { path: candidate, source };
    }
    return null;
}

interface ParsedSkill {
    frontmatter: Record<string, string>;
    body: string;
}

const MAX_LISTED_SKILL_RESOURCES = 200;

function escapeXmlText(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

export function listSkillResources(skillMdPath: string): {
    paths: string[];
    truncated: boolean;
} {
    const skillDir = dirname(skillMdPath);
    const paths: string[] = [];
    let truncated = false;

    const walk = (directory: string, relativeDirectory: string): void => {
        let entries: Dirent[];
        try {
            entries = readdirSync(directory, { withFileTypes: true });
        } catch {
            return;
        }
        for (const entry of entries.sort((left, right) =>
            left.name.localeCompare(right.name)
        )) {
            const relativePath = relativeDirectory
                ? `${relativeDirectory}/${entry.name}`
                : entry.name;
            if (relativePath.toUpperCase() === "SKILL.MD") continue;
            if (paths.length >= MAX_LISTED_SKILL_RESOURCES) {
                truncated = true;
                return;
            }
            if (entry.isDirectory()) {
                walk(join(directory, entry.name), relativePath);
                if (truncated) return;
            } else if (entry.isFile()) {
                paths.push(relativePath);
            }
        }
    };

    walk(skillDir, "");
    return { paths, truncated };
}

function parseSkillContents(raw: string): ParsedSkill {
    const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    const frontmatter: Record<string, string> = {};
    let body = raw;
    if (fmMatch) {
        body = fmMatch[2] ?? "";
        for (const line of (fmMatch[1] ?? "").split(/\r?\n/)) {
            const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
            if (m) frontmatter[m[1]] = m[2].trim();
        }
    }
    return { frontmatter, body: body.trim() };
}

function loadSkill(
    args: Record<string, unknown>,
    ctx?: ToolRunContext
): ToolRunResult {
    const name = String(args.name ?? "").trim();
    if (!name) {
        return { output: "Skill: missing 'name' argument", isError: true };
    }
    const found = findSkillPath(name, ctx);
    if (!found) {
        return {
            output: `Skill '${name}' not found. Available roots: ${getSkillRoots(ctx)
                .map((r) => r.root)
                .join(", ") || "(none)"}`,
            isError: true,
        };
    }
    let raw: string;
    try {
        raw = readFileSync(found.path, "utf-8");
    } catch (err) {
        return {
            output: `Skill '${name}': read failed — ${
                err instanceof Error ? err.message : String(err)
            }`,
            isError: true,
        };
    }
    const parsed = parseSkillContents(raw);
    if (!parsed.body) {
        return {
            output: `Skill '${name}' has no body (only frontmatter found).`,
            isError: true,
        };
    }
    const skillDir = dirname(found.path);
    const resources = listSkillResources(found.path);
    const resourceLines = resources.paths.map(
        (resourcePath) => `  <file>${escapeXmlText(resourcePath)}</file>`
    );
    if (resources.truncated) resourceLines.push("  <truncated>true</truncated>");
    const resourcesSection =
        resourceLines.length > 0
            ? `\n\n<skill_resources>\n${resourceLines.join("\n")}\n</skill_resources>`
            : "";
    const header =
        `# ${parsed.frontmatter.name ?? name}\n` +
        `Source: ${found.source} (${found.path})\n` +
        `Skill directory: ${skillDir}\n` +
        "Relative paths in this skill are relative to the skill directory.\n\n";
    return {
        output: header + parsed.body + resourcesSection,
        isError: false,
    };
}

function listSkills(ctx?: ToolRunContext): ToolRunResult {
    const seen = new Map<string, { description: string; source: string }>();
    for (const { root, source } of getSkillRoots(ctx)) {
        let entries: string[];
        try {
            entries = readdirSync(root);
        } catch {
            continue;
        }
        for (const entry of entries) {
            if (entry.startsWith(".")) continue;
            if (seen.has(entry)) continue;
            const dir = join(root, entry);
            try {
                if (!statSync(dir).isDirectory()) continue;
            } catch {
                continue;
            }
            const md = join(dir, "SKILL.md");
            if (!existsSync(md)) continue;
            try {
                const raw = readFileSync(md, "utf-8");
                const { frontmatter } = parseSkillContents(raw);
                seen.set(entry, {
                    description: frontmatter.description ?? "(no description)",
                    source,
                });
            } catch {
                // skip unreadable
            }
        }
    }
    if (seen.size === 0) return { output: "No skills found.", isError: false };
    const lines = Array.from(seen.entries()).map(
        ([name, info]) => `- ${name} [${info.source}] — ${info.description}`
    );
    return { output: lines.join("\n"), isError: false };
}
