import { homedir } from "os";
import { join } from "path";
import { promises as fs } from "fs";
import { app } from "electron";
import { downloadSkillsFromGitHub } from "../skillDownloader.js";

const GLOBAL_SKILLS_DIR = join(homedir(), ".letta", "skills");

/**
 * Ensure the acquiring-skills skill is installed from the bundled letta-code package.
 * This skill is required for the agent to discover and install other skills.
 */
export async function ensureAcquiringSkillInstalled(): Promise<void> {
    const targetDir = join(GLOBAL_SKILLS_DIR, "acquiring-skills");
    const targetFile = join(targetDir, "SKILL.md");

    // Already installed — nothing to do
    try {
        await fs.access(targetFile);
        console.log("[skillInstaller] acquiring-skills already installed at", targetDir);
        return;
    } catch {
        // Not found — continue to install
    }

    // Resolve source from node_modules (works in both dev and packaged builds)
    const isDevelopment = !app.isPackaged;
    const sourceDir = isDevelopment
        ? join(process.cwd(), "node_modules", "@letta-ai", "letta-code", "skills", "acquiring-skills")
        : join(process.resourcesPath, "app.asar.unpacked", "node_modules", "@letta-ai", "letta-code", "skills", "acquiring-skills");

    try {
        // Ensure target directory exists
        await fs.mkdir(targetDir, { recursive: true });

        // Copy all files from source to target
        const entries = await fs.readdir(sourceDir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isFile()) {
                const src = join(sourceDir, entry.name);
                const dst = join(targetDir, entry.name);
                await fs.copyFile(src, dst);
            }
        }
        console.log("[skillInstaller] acquiring-skills installed at", targetDir);
    } catch (err) {
        console.warn("[skillInstaller] Failed to install acquiring-skills:", err);
    }
}

/**
 * Default cowork skills to install from GitHub.
 * These are skills specific to the Vera Cowork application.
 */
const DEFAULT_SKILLS_REPO = {
    owner: "vvolt-ai",
    repo: "letta-cowork",
    branch: "main",
    path: "skills",
};

/**
 * Ensure default cowork skills are installed from GitHub.
 * Always downloads the latest version to keep skills updated.
 */
export async function ensureDefaultCoworkSkillsInstalled(): Promise<void> {
    const markerFile = join(GLOBAL_SKILLS_DIR, ".default-skills-installed");

    try {
        console.log("[skillInstaller] Checking for default cowork skills updates...");

        // Fetch the contents of the skills directory to get list of skill subdirectories
        const skillsUrl = `https://api.github.com/repos/${DEFAULT_SKILLS_REPO.owner}/${DEFAULT_SKILLS_REPO.repo}/contents/${DEFAULT_SKILLS_REPO.path}?ref=${DEFAULT_SKILLS_REPO.branch}`;
        const res = await fetch(skillsUrl);
        if (!res.ok) {
            throw new Error(`Failed to fetch skills directory: ${res.status}`);
        }
        const entries = (await res.json()) as Array<{ type: string; name: string; path: string }>;

        // Filter to only directories (each directory is a skill)
        const skillDirs = entries.filter((e) => e.type === "dir");
        console.log(`[skillInstaller] Found ${skillDirs.length} skills to update:`, skillDirs.map((s) => s.name).join(", "));

        // Download each skill directory separately (always overwrites)
        for (const skillDir of skillDirs) {
            const skillHandle = `${DEFAULT_SKILLS_REPO.owner}/${DEFAULT_SKILLS_REPO.repo}/${skillDir.path}`;
            console.log(`[skillInstaller] Updating ${skillDir.name}...`);
            await downloadSkillsFromGitHub(skillHandle, skillDir.name, DEFAULT_SKILLS_REPO.branch);
        }

        console.log("[skillInstaller] Default cowork skills updated successfully");

        // Update marker file with timestamp
        await fs.writeFile(markerFile, new Date().toISOString(), "utf-8");
    } catch (err) {
        console.warn("[skillInstaller] Failed to update default cowork skills:", err);
    }
}

/**
 * Install all required skills on app startup.
 * Call this once when the app is ready.
 */
export async function installRequiredSkills(): Promise<void> {
    // Ensure acquiring-skills is present so the agent can discover all other skills
    await ensureAcquiringSkillInstalled();
    // Ensure default cowork skills are installed from GitHub
    await ensureDefaultCoworkSkillsInstalled();
}
