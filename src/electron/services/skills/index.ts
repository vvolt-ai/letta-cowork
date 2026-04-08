import { join, dirname } from "path";
import { mkdir, writeFile } from "fs/promises";

// this mirrors the constant used by the letta CLI/SDK (see inside node_modules/.../letta.js)
export const GLOBAL_SKILLS_DIR2 = join(
    process.env.HOME || process.env.USERPROFILE || "~",
    ".letta/skills"
);

// ensure a directory exists recursively
async function ensureDir(dir: string) {
    await mkdir(dir, { recursive: true });
}

// write a file inside the skills directory, creating parent folders as needed
async function writeSkillFile(destDir: string, relativePath: string, content: string) {
    const fullPath = join(destDir, relativePath);
    await ensureDir(dirname(fullPath));
    await writeFile(fullPath, content, "utf-8");
}

interface GitHubEntry {
    type: "file" | "dir";
    path: string;
    download_url?: string;
}

async function fetchGitHubContents(
    owner: string,
    repo: string,
    branch: string,
    pathArg: string
): Promise<GitHubEntry[] | GitHubEntry> {
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${pathArg}?ref=${branch}`;
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`Failed to fetch GitHub contents: ${res.status} ${res.statusText}`);
    }
    return res.json();
}

async function downloadGitHubDirectory(
    entries: GitHubEntry[],
    destDir: string,
    owner: string,
    repo: string,
    branch: string,
    basePath: string
) {
    for (const entry of entries) {
        if (entry.type === "file") {
            if (!entry.download_url) {
                throw new Error(`Missing download_url for file: ${entry.path}`);
            }
            const fileRes = await fetch(entry.download_url);
            const fileContent = await fileRes.text();
            const relativePath = entry.path.replace(`${basePath}/`, "");
            await writeSkillFile(destDir, relativePath, fileContent);
        } else if (entry.type === "dir") {
            const subEntries = await fetchGitHubContents(owner, repo, branch, entry.path) as GitHubEntry[];
            await downloadGitHubDirectory(subEntries, destDir, owner, repo, branch, basePath);
        }
    }
}


// normalize a user-supplied handle or full GitHub URL into the canonical
// "owner/repo[/path]" form.  If the URL contains a tree/blob component we
// drop the \"tree/blob\" token and branch name from the returned handle and
// also return the branch as a second value (only when branchArg is undefined).
function normalizeHandle(
    input: string
): { handle: string; guessedBranch?: string } {
    let handle = input.trim();
    let guessedBranch: string | undefined;

    // simple URL?
    try {
        const url = new URL(handle);
        if (
            url.hostname === "github.com" ||
            url.hostname.endsWith(".github.com")
        ) {
            const parts = url.pathname.split("/").filter(Boolean);
            const [owner, repo, third, fourth, ...rest] = parts;
            if (!owner || !repo) {
                throw new Error("Invalid GitHub URL: missing owner or repo");
            }
            if (third === "tree" || third === "blob") {
                guessedBranch = fourth;
                handle = [owner, repo, ...rest].join("/");
            } else {
                handle = [owner, repo, third, fourth, ...rest]
                    .filter(Boolean)
                    .join("/");
            }
        }
    } catch {
        // not a valid URL, assume it is already a handle
    }

    return { handle, guessedBranch };
}

/**
 * Download one or more skills from GitHub.  The `handles` argument may be a
 * single string or an array; strings may contain multiple comma/space-
 * separated values and may be full GitHub URLs.  For each handle the files
 * will be placed under `GLOBAL_SKILLS_DIR2/<skillName>`, using the provided
 * skill name or deriving it from the last path segment.
 * The optional `branch` argument will be applied to *all*
 * handles; if it is omitted and a URL contained a `/tree/<branch>` segment
 * we will use that value.
 *
 * Returns an array of directories where skills were written.
 */
export async function downloadSkillsFromGitHub(
    handles: string | string[],
    skillName?: string,
    branch?: string
): Promise<string[]> {
    // flatten into array of tokens
    const list: string[] = [];
    if (Array.isArray(handles)) {
        list.push(...handles);
    } else {
        list.push(...handles.split(/[ ,]+/));
    }

    const resultDirs: string[] = [];

    for (let h of list) {
        if (!h) continue;
        const { handle: normalized, guessedBranch } = normalizeHandle(h);
        const parts = normalized.split("/");
        const [owner, repo, ...rest] = parts;
        if (!owner || !repo) {
            throw new Error(`Invalid GitHub handle "${h}"`);
        }
        const basePath = rest.join("/");
        const effectiveBranch = branch || guessedBranch || "main";

        // use the provided skill name, or derive from path/repo
        const finalSkillName = skillName || (rest.length > 0 ? rest[rest.length - 1] : repo);
        const skillDir = join(GLOBAL_SKILLS_DIR2, finalSkillName);
        await ensureDir(skillDir);

        const entriesRaw = await fetchGitHubContents(owner, repo, effectiveBranch, basePath || "");
        if (!Array.isArray(entriesRaw)) {
            throw new Error(`Expected a directory when downloading skill, but got a file at ${basePath}`);
        }
        await downloadGitHubDirectory(entriesRaw, skillDir, owner, repo, effectiveBranch, basePath);
        resultDirs.push(skillDir);
    }

    return resultDirs;
}

// backward-compatible helper to download a single skill
export async function downloadSkillFromGitHub(handle: string, skillName?: string, branch?: string) {
    await downloadSkillsFromGitHub(handle, skillName, branch);
}
