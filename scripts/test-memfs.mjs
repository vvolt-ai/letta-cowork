// Smoke test for the new memfs module. Loads env from .env, picks an
// agent id from argv or env, and exercises the public API.
//
// Usage:
//   node scripts/test-memfs.mjs <agent-id>
//   node scripts/test-memfs.mjs            (uses LETTA_AGENT_ID from .env)

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

// Tiny .env loader so we don't need dotenv as a runtime dep here.
const envPath = resolve(process.cwd(), ".env");
if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
        if (!m) continue;
        const [, k, raw] = m;
        const v = raw.replace(/^['"]|['"]$/g, "");
        if (!process.env[k]) process.env[k] = v;
    }
}

const agentId = process.argv[2] || process.env.LETTA_AGENT_ID;
if (!agentId) {
    console.error("Usage: node scripts/test-memfs.mjs <agent-id>");
    process.exit(1);
}
console.log(`[test-memfs] agent=${agentId}`);
console.log(`[test-memfs] base=${process.env.LETTA_BASE_URL || "(default api.letta.com)"}`);
console.log(`[test-memfs] token=${process.env.LETTA_API_KEY ? "set" : "MISSING"}`);

const {
    ensureCheckout,
    getMemoryRepoDir,
    isGitRepo,
    getMemoryGitStatus,
    listFiles,
    readMemoryFile,
} = await import("../dist-electron/services/memfs/memfsGit.js");

const t0 = Date.now();
console.log(`[test-memfs] repo dir: ${getMemoryRepoDir(agentId)}`);
console.log(`[test-memfs] isGitRepo (before): ${isGitRepo(agentId)}`);

const dir = await ensureCheckout(agentId);
console.log(`[test-memfs] ensureCheckout -> ${dir} (${Date.now() - t0}ms)`);
console.log(`[test-memfs] isGitRepo (after): ${isGitRepo(agentId)}`);

const status = await getMemoryGitStatus(agentId);
console.log(`[test-memfs] status: ${JSON.stringify(status)}`);

const files = await listFiles(agentId);
console.log(`[test-memfs] listFiles count: ${files.length}`);
console.log(`[test-memfs] first 5:`);
for (const f of files.slice(0, 5)) {
    console.log(`  - [${f.category}] ${f.path}  desc="${f.description ?? "(none)"}"`);
}

// Try reading one non-system file (the kind WhatsApp couldn't access)
const nonSystem = files.find((f) => f.category !== "system") || files[0];
if (nonSystem) {
    const content = await readMemoryFile(agentId, nonSystem.path);
    console.log(`[test-memfs] readMemoryFile("${nonSystem.path}"): ${content.length} chars, first 200:`);
    console.log("  " + content.slice(0, 200).replace(/\n/g, "\n  "));
}

console.log(`[test-memfs] OK (total ${Date.now() - t0}ms)`);
