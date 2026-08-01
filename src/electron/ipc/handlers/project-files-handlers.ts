import { constants } from "node:fs";
import { access, open, readdir, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { ipcMainHandle } from "../../utils/index.js";

const HIDDEN_DIRECTORIES = new Set([".git", "node_modules", ".next", "dist", "dist-react", "build", "coverage"]);
const MAX_DIRECTORY_ENTRIES = 500;
const MAX_PREVIEW_BYTES = 512 * 1024;

export interface ProjectFileEntry {
  name: string;
  path: string;
  kind: "file" | "directory";
  size?: number;
}

export interface ProjectFilePreview {
  path: string;
  content: string;
  size: number;
  truncated: boolean;
}

async function resolveProjectRoot(rootPath: unknown): Promise<string> {
  if (typeof rootPath !== "string" || !rootPath.trim() || !isAbsolute(rootPath)) {
    throw new Error("A valid absolute project root is required.");
  }
  const root = await realpath(rootPath);
  const info = await stat(root);
  if (!info.isDirectory()) throw new Error("Project root is not a directory.");
  return root;
}

async function resolveWithinRoot(root: string, relativePath: unknown): Promise<string> {
  if (typeof relativePath !== "string" || isAbsolute(relativePath)) {
    throw new Error("Project paths must be relative.");
  }
  const candidate = resolve(root, relativePath || ".");
  const lexicalRelative = relative(root, candidate);
  if (lexicalRelative.startsWith("..") || isAbsolute(lexicalRelative)) {
    throw new Error("Project path escapes the workspace root.");
  }
  const resolved = await realpath(candidate);
  const resolvedRelative = relative(root, resolved);
  if (resolvedRelative.startsWith("..") || isAbsolute(resolvedRelative)) {
    throw new Error("Project path resolves outside the workspace root.");
  }
  return resolved;
}

async function listProjectFiles(rootPath: string, directoryPath = ""): Promise<ProjectFileEntry[]> {
  const root = await resolveProjectRoot(rootPath);
  const directory = await resolveWithinRoot(root, directoryPath);
  const info = await stat(directory);
  if (!info.isDirectory()) throw new Error("Requested project path is not a directory.");

  const children = (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => !entry.isSymbolicLink() && !HIDDEN_DIRECTORIES.has(entry.name))
    .slice(0, MAX_DIRECTORY_ENTRIES);

  const entries = await Promise.all(children.map(async (entry): Promise<ProjectFileEntry | null> => {
    const absolutePath = resolve(directory, entry.name);
    const itemPath = relative(root, absolutePath);
    if (entry.isDirectory()) return { name: entry.name, path: itemPath, kind: "directory" };
    if (!entry.isFile()) return null;
    const fileInfo = await stat(absolutePath).catch(() => null);
    return { name: entry.name, path: itemPath, kind: "file", size: fileInfo?.size };
  }));

  return entries
    .filter((entry): entry is ProjectFileEntry => entry !== null)
    .sort((left, right) => left.kind === right.kind
      ? left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" })
      : left.kind === "directory" ? -1 : 1);
}

async function readProjectFile(rootPath: string, filePath: string): Promise<ProjectFilePreview> {
  const root = await resolveProjectRoot(rootPath);
  const file = await resolveWithinRoot(root, filePath);
  const info = await stat(file);
  if (!info.isFile()) throw new Error("Requested project path is not a file.");
  await access(file, constants.R_OK);

  const bytesToRead = Math.min(info.size, MAX_PREVIEW_BYTES);
  const buffer = Buffer.alloc(bytesToRead);
  const handle = await open(file, "r");
  try {
    if (bytesToRead > 0) await handle.read(buffer, 0, bytesToRead, 0);
  } finally {
    await handle.close();
  }
  if (buffer.includes(0)) throw new Error("Binary files cannot be previewed.");

  return {
    path: relative(root, file),
    content: buffer.toString("utf8"),
    size: info.size,
    truncated: info.size > MAX_PREVIEW_BYTES,
  };
}

/** Read-only, root-scoped filesystem bridge for the project workspace. */
export function registerProjectFilesHandlers(): void {
  ipcMainHandle("project-files:list", async (_event, rootPath: string, directoryPath?: string) => {
    return listProjectFiles(rootPath, directoryPath ?? "");
  });
  ipcMainHandle("project-files:read", async (_event, rootPath: string, filePath: string) => {
    return readProjectFile(rootPath, filePath);
  });
}
