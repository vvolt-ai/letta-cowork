import fs from "fs";
import path from "path";
import { Letta } from "@letta-ai/letta-client";

const SUPPORTED_FILE_EXTENSIONS = new Set([
  ".pdf",
  ".txt",
  ".md",
  ".json",
  ".docx",
  ".html",
]);

export type AttachFilesToAgentResult =
  | {
      status: "skipped";
      reason: string;
    }
  | {
      status: "attached";
      folderId: string;
      folderName: string;
      agentId: string;
      uploadedFiles: string[];
      skippedFiles: string[];
      failedFiles: { file: string; error: string }[];
    };

type AttachFilesToAgentArgs = {
  agentId: string;
  filePaths: string[];
  folderNamePrefix: string;
};

function sanitizeSegment(input: string): string {
  return input.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60);
}

function buildFolderName(prefix: string): string {
  const safePrefix = sanitizeSegment(prefix) || "zoho_attachments";
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${safePrefix}_${timestamp}`;
}

function isSupportedPath(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return SUPPORTED_FILE_EXTENSIONS.has(ext);
}

function createLettaClient(): Letta {
  const baseURL = (process.env.LETTA_BASE_URL || "https://api.letta.com").trim();
  const apiKey = (process.env.LETTA_API_KEY || "").trim();

  return new Letta({
    baseURL,
    apiKey: apiKey || null,
  });
}

export async function attachFilesToAgentFolder({
  agentId,
  filePaths,
  folderNamePrefix,
}: AttachFilesToAgentArgs): Promise<AttachFilesToAgentResult> {
  const existingFiles = filePaths.filter((filePath) => fs.existsSync(filePath));
  const supportedFiles = existingFiles.filter(isSupportedPath);
  const skippedFiles = existingFiles
    .filter((filePath) => !isSupportedPath(filePath))
    .map((filePath) => path.basename(filePath));

  if (supportedFiles.length === 0) {
    return {
      status: "skipped",
      reason: "No supported attachment formats found to upload.",
    };
  }

  const client = createLettaClient();
  const folderName = buildFolderName(folderNamePrefix);

  const folder = await client.folders.create({
    name: folderName,
    embedding: "lmstudio_openai/text-embedding-nomic-embed-text-v1.5@f32",
  });

  const uploadedFiles: string[] = [];
  const failedFiles: { file: string; error: string }[] = [];

  for (const filePath of supportedFiles) {
    const fileName = path.basename(filePath);
    try {
      await client.folders.files.upload(folder.id, {
        file: fs.createReadStream(filePath),
        duplicate_handling: "suffix",
      });
      uploadedFiles.push(fileName);
    } catch (error) {
      failedFiles.push({ file: fileName, error: error instanceof Error ? error.message : String(error) });
    }
  }

  if (uploadedFiles.length === 0) {
    return {
      status: "skipped",
      reason: "All supported files failed to upload.",
    };
  }

  await client.agents.folders.attach(folder.id, { agent_id: agentId });

  return {
    status: "attached",
    folderId: folder.id,
    folderName,
    agentId,
    uploadedFiles,
    skippedFiles,
    failedFiles,
  };
}
