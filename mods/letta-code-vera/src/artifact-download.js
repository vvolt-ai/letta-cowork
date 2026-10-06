import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, open, realpath, link, unlink } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

const DEFAULT_MAX_BYTES = 25 * 1024 * 1024;
const CHUNK_BYTES = 16384;
const inside = (root, file) => { const rel = relative(root, file); return rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel); };
class ArtifactDownloadError extends Error {}
const fail = message => { throw new ArtifactDownloadError(message); };
function abortable(promise, signal) {
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(new ArtifactDownloadError('Artifact download cancelled or timed out; no completed file was saved.'));
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
    Promise.resolve(promise).then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}

/** Bytes stay inside trusted code, not model output. Authentication is supplied
 * by the existing MCP client. No model-supplied URL/header/token is accepted. */
export async function downloadVeraArtifact(client, args, ctx = {}) {
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(String(args.artifactId ?? ""))) fail("artifactId must be the UUID returned by Vera.");
  if (typeof args.filePath !== "string" || !args.filePath.trim() || args.filePath.length > 4096 || args.filePath.includes("\0")) fail("filePath is required.");
  const maxBytes = args.maxBytes ?? DEFAULT_MAX_BYTES;
  const timeoutMs = args.timeoutMs ?? 120000;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 250 * 1024 * 1024) fail("Invalid maxBytes limit.");
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 300000) fail("Invalid timeoutMs limit.");
  if (args.expectedSha256 !== undefined && !/^[a-f0-9]{64}$/i.test(args.expectedSha256)) fail("expectedSha256 must be a SHA-256 digest.");
  const root = await realpath(ctx.cwd || process.cwd());
  const target = resolve(root, args.filePath);
  if (!inside(root, target) || target === root) fail("Destination must be inside the current approved workspace.");
  let current = root;
  for (const part of relative(root, target).split(sep)) {
    current = join(current, part);
    const stat = await lstat(current).catch(error => { if (error.code !== "ENOENT") throw error; return null; });
    if (stat?.isSymbolicLink()) fail("Artifact destinations must not follow symlinks.");
    if (current === target && stat) fail("Destination already exists. Choose a new file path; no overwrite is performed.");
  }
  await mkdir(dirname(target), { recursive: true });
  const parent = await realpath(dirname(target));
  if (!inside(root, parent)) fail("Destination resolves outside the approved workspace.");
  const temporary = join(parent, `.vera-artifact-${randomUUID()}.partial`);
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (ctx.signal?.aborted) controller.abort();
  else ctx.signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, timeoutMs);
  let file;
  try {
    file = await open(temporary, "wx", 0o600);
    let offset = 0, metadata;
    const hash = createHash("sha256");
    while (true) {
      if (controller.signal.aborted) fail("Artifact download cancelled or timed out; no completed file was saved.");
      const result = await abortable(client.invokeMcpTool("vera_read_artifact", { artifactId: args.artifactId, offset, maxBytes: CHUNK_BYTES }, controller.signal), controller.signal);
      if (controller.signal.aborted) fail("Artifact download cancelled or timed out; no completed file was saved.");
      if (result?.isError) fail("Vera could not read this artifact. Verify the same user/organization and re-fetch an expired artifact.");
      let chunk;
      try { chunk = JSON.parse(result.output); } catch { fail("Vera returned an invalid artifact response."); }
      if (!chunk || chunk.artifactId !== args.artifactId || chunk.offset !== offset || chunk.encoding !== "base64" ||
        !Number.isSafeInteger(chunk.size) || chunk.size < 0 || chunk.size > maxBytes || !/^[a-f0-9]{64}$/i.test(chunk.sha256 ?? "")) fail("Invalid artifact identity, size or digest.");
      if (metadata && (chunk.size !== metadata.size || chunk.sha256 !== metadata.sha256)) fail("Artifact metadata changed during transfer.");
      metadata ??= { size: chunk.size, sha256: chunk.sha256, filename: chunk.filename, contentType: chunk.contentType };
      if (args.expectedSha256 && metadata.sha256.toLowerCase() !== args.expectedSha256.toLowerCase()) fail("Artifact digest does not match the requested file.");
      if (typeof chunk.data !== "string" || chunk.data.length > 4 * Math.ceil(CHUNK_BYTES / 3) || chunk.data.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(chunk.data)) fail("Invalid base64 artifact bytes.");
      const bytes = Buffer.from(chunk.data, "base64");
      if (bytes.toString("base64") !== chunk.data || bytes.length !== chunk.bytesRead || chunk.nextOffset !== offset + bytes.length || chunk.nextOffset > metadata.size || chunk.eof !== (chunk.nextOffset === metadata.size) || (!bytes.length && !chunk.eof)) fail("Artifact chunk offsets or bytes are inconsistent.");
      hash.update(bytes);
      let written = 0;
      while (written < bytes.length) {
        const result = await file.write(bytes, written, bytes.length - written, offset + written);
        if (result.bytesWritten === 0) fail("Could not save artifact bytes.");
        written += result.bytesWritten;
      }
      offset = chunk.nextOffset;
      if (chunk.eof) {
        if (hash.digest("hex") !== metadata.sha256.toLowerCase()) fail("Artifact SHA-256 verification failed; no completed file was saved.");
        await file.sync(); await file.close(); file = undefined;
        if (controller.signal.aborted) fail("Artifact download cancelled before publication.");
        // Revalidate parent and atomically publish without replacing an existing
        // file (including one created while the transfer was in progress).
        if (await realpath(dirname(target)) !== parent) fail("Destination directory changed during transfer.");
        await link(temporary, target);
        return { saved: true, filePath: target, size: offset, sha256: metadata.sha256.toLowerCase(), transport: "authenticated MCP", contentType: typeof metadata.contentType === "string" ? metadata.contentType.slice(0, 120) : null };
      }
    }
  } catch (error) {
    if (error instanceof ArtifactDownloadError) throw error;
    if (error.code === "EEXIST") fail("Destination already exists; no overwrite was performed.");
    fail("Artifact transfer could not be completed. Check Vera access, artifact expiry, workspace permissions or timeout; re-fetch before retrying. No completed file was saved.");
  } finally {
    clearTimeout(timer); ctx.signal?.removeEventListener("abort", abort);
    await file?.close().catch(() => {});
    // Cleanup must not turn a verified, published file into a false failure.
    await unlink(temporary).catch(() => {});
  }
}
