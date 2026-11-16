import { constants } from 'node:fs';
import { open, realpath, lstat } from 'node:fs/promises';
import { basename, isAbsolute, relative, resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';

export const FILE_MANAGER_ORIGIN = 'https://filemanage.ngrok.app';
const MAX_BYTES = 25 * 1024 * 1024;
type Context = { signal: AbortSignal; workingDirectory?: string };
type Result = { output: string; isError: boolean };
export type FileManagerSnapshot = { bytes: Buffer; filename: string };
class TransferError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
const fail = (code: string): never => {
  throw new TransferError(code);
};
const result = (value: Record<string, unknown>, isError = false): Result => ({
  output: JSON.stringify(value),
  isError,
});
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const outside = (root: string, file: string) => {
  const p = relative(root, file);
  return p === '..' || p.startsWith('..' + sep) || isAbsolute(p);
};
function safeName(name: string) {
  if (
    !name ||
    name.length > 180 ||
    basename(name) !== name ||
    [...name].some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 || c === '/' || c === '\\') ||
    name.startsWith('.') ||
    /^(?:id_rsa|id_ed25519|credentials|secrets?|tokens?)(?:\.|$)|\.(?:pem|key|p12|pfx|kdbx)$/i.test(
      name,
    )
  )
    fail('FILE_NAME_NOT_ALLOWED');
}
function inspect(snapshot: FileManagerSnapshot) {
  safeName(snapshot.filename);
  if (!snapshot.bytes.length || snapshot.bytes.length > MAX_BYTES) fail('FILE_SIZE_NOT_ALLOWED');
  // Defense in depth only, not a DLP/classification guarantee. No bytes are logged.
  if (
    /-----BEGIN [A-Z ]*PRIVATE KEY-----|\bBearer\s+[A-Za-z0-9._-]{24,}|\b(?:ghp_|github_pat_|sk-(?:proj-)?)[A-Za-z0-9_-]{24,}|\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/.test(
      snapshot.bytes.toString('utf8'),
    )
  )
    fail('POSSIBLE_SECRET_CONTENT');
}
export async function readFileManagerSnapshot(
  file: unknown,
  ctx: Context,
): Promise<FileManagerSnapshot> {
  if (typeof file !== 'string' || !file || file.includes('\0') || !ctx.workingDirectory)
    fail('WORKSPACE_FILE_REQUIRED');
  ctx.signal.throwIfAborted();
  const lexicalRoot = resolve(ctx.workingDirectory!);
  const root = await realpath(lexicalRoot);
  if (
    root
      .split(sep)
      .some((p) =>
        ['.letta', '.ssh', '.aws', '.gnupg', '.git', '.cowork', '.claude', '.azure'].includes(p),
      )
  )
    fail('PRIVATE_PATH_DENIED');
  const requested = resolve(lexicalRoot, file as string),
    canonical = await realpath(requested);
  if (
    (outside(root, requested) && outside(lexicalRoot, requested)) ||
    outside(root, canonical) ||
    [
      relative(outside(root, requested) ? lexicalRoot : root, requested),
      relative(root, canonical),
    ].some((p) => p.split(sep).some((segment) => segment.startsWith('.')))
  )
    fail('WORKSPACE_PATH_DENIED');
  for (const privateRoot of [
    '/run/vera-sandbox',
    '/app/data/sandbox-artifacts',
    process.env.SANDBOX_ARTIFACT_ROOT,
    process.env.SANDBOX_BROKER_SOCKET,
  ].filter((p): p is string => Boolean(p))) {
    const roots = [resolve(privateRoot)];
    try {
      roots.push(await realpath(privateRoot));
    } catch {
      /* A configured private root may not exist yet. */
    }
    if (roots.some((p) => !outside(p, canonical) || !outside(p, requested)))
      fail('PRIVATE_PATH_DENIED');
  }
  const before = await lstat(requested);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size < 1 || before.size > MAX_BYTES)
    fail('FILE_SIZE_OR_TYPE_NOT_ALLOWED');
  const handle = await open(canonical, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const opened = await handle.stat();
    if (
      !opened.isFile() ||
      opened.size < 1 ||
      opened.size > MAX_BYTES ||
      opened.dev !== before.dev ||
      opened.ino !== before.ino
    )
      fail('FILE_CHANGED');
    const bytes = Buffer.alloc(opened.size),
      extra = Buffer.alloc(1);
    let offset = 0;
    while (offset < bytes.length) {
      ctx.signal.throwIfAborted();
      const read = await handle.read(bytes, offset, bytes.length - offset, offset);
      if (!read.bytesRead) fail('FILE_CHANGED');
      offset += read.bytesRead;
    }
    if ((await handle.read(extra, 0, 1, offset)).bytesRead) fail('FILE_CHANGED');
    const after = await handle.stat();
    if (
      after.size !== opened.size ||
      after.mtimeMs !== opened.mtimeMs ||
      after.ctimeMs !== opened.ctimeMs ||
      (await realpath(requested)) !== canonical
    )
      fail('FILE_CHANGED');
    const snapshot = { bytes, filename: basename(canonical) };
    inspect(snapshot);
    return snapshot;
  } finally {
    await handle.close();
  }
}
async function boundedBody(
  response: Response,
  maximum: number,
  signal: AbortSignal,
): Promise<Buffer> {
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader(),
    chunks: Buffer[] = [];
  let size = 0;
  try {
    while (true) {
      signal.throwIfAborted();
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > maximum) {
        await reader.cancel().catch(() => {});
        fail('RESPONSE_TOO_LARGE');
      }
      chunks.push(Buffer.from(part.value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, size);
}
function receiptUrl(value: unknown): string {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    (value as Record<string, unknown>).success === false ||
    (value as Record<string, unknown>).ok === false
  )
    return fail('INVALID_UPLOAD_RECEIPT');
  const urls = new Set<string>();
  for (const item of Object.values(value)) {
    if (typeof item !== 'string') continue;
    try {
      const u = new URL(item);
      if (
        u.origin === FILE_MANAGER_ORIGIN &&
        !u.username &&
        !u.password &&
        !u.search &&
        !u.hash &&
        /^\/files\/[A-Za-z0-9_-]{1,200}$/.test(u.pathname) &&
        !['/files/health', '/files/upload'].includes(u.pathname)
      )
        urls.add(u.href);
    } catch {
      /* Non-URL receipt fields are data. */
    }
  }
  if (urls.size !== 1) return fail('NO_UNIQUE_SAFE_DOWNLOAD_URL');
  return [...urls][0];
}
export async function uploadFileManagerSnapshot(
  snapshot: FileManagerSnapshot,
  ctx: Context,
  fetcher: typeof fetch = fetch,
): Promise<Result> {
  let attempted = false,
    candidate: string | undefined;
  try {
    inspect(snapshot);
    const signal = AbortSignal.any([ctx.signal, AbortSignal.timeout(120000)]);
    signal.throwIfAborted();
    const hash = digest(snapshot.bytes),
      form = new FormData();
    form.append(
      'file',
      new Blob([new Uint8Array(snapshot.bytes)], { type: 'application/octet-stream' }),
      snapshot.filename,
    );
    attempted = true;
    const upload = await fetcher(FILE_MANAGER_ORIGIN + '/files/upload', {
      method: 'POST',
      body: form,
      redirect: 'error',
      credentials: 'omit',
      headers: { 'ngrok-skip-browser-warning': 'true' },
      signal,
    });
    if (!upload.ok) fail('UPLOAD_HTTP_' + upload.status);
    let receipt: unknown;
    try {
      receipt = JSON.parse((await boundedBody(upload, 65536, signal)).toString('utf8'));
    } catch (error) {
      if (error instanceof TransferError) throw error;
      fail('INVALID_UPLOAD_RECEIPT');
    }
    candidate = receiptUrl(receipt);
    const download = await fetcher(candidate, {
      method: 'GET',
      redirect: 'error',
      credentials: 'omit',
      headers: { 'ngrok-skip-browser-warning': 'true' },
      signal,
    });
    if (!download.ok) fail('VERIFY_HTTP_' + download.status);
    const bytes = await boundedBody(download, snapshot.bytes.length, signal);
    if (bytes.length !== snapshot.bytes.length || digest(bytes) !== hash)
      fail('DOWNLOAD_HASH_MISMATCH');
    return result({
      status: 'verified',
      upload_attempted: true,
      download_verified: true,
      filename: snapshot.filename,
      size: bytes.length,
      sha256: hash,
      download_url: candidate,
      visibility: 'Access-bearing link; authentication, expiry and deletion are not established.',
    });
  } catch (error) {
    return result(
      {
        status: attempted ? 'unverified' : 'not_uploaded',
        code:
          error instanceof TransferError
            ? error.code
            : ctx.signal.aborted
              ? 'CANCELLED'
              : 'TRANSFER_FAILED',
        upload_attempted: attempted,
        download_verified: false,
        outcome_unknown: attempted,
        retryable: false,
        ...(candidate ? { receipt_download_url: candidate } : {}),
        message: attempted
          ? 'The file may already be stored. Do not automatically repeat the upload.'
          : 'No upload was attempted.',
      },
      true,
    );
  }
}
export function createFileManagerTools(fetcher: typeof fetch = fetch) {
  return [
    {
      name: 'FileManagerHealth',
      description:
        'Check the configured File Manager service health. Read-only; does not upload files or prove privacy/retention guarantees.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      async run(args: Record<string, unknown>, ctx: Context): Promise<Result> {
        if (Object.keys(args).length) return result({ code: 'UNSUPPORTED_ARGUMENT' }, true);
        try {
          const signal = AbortSignal.any([ctx.signal, AbortSignal.timeout(15000)]),
            r = await fetcher(FILE_MANAGER_ORIGIN + '/files/health', {
              method: 'GET',
              redirect: 'error',
              credentials: 'omit',
              signal,
            });
          if (!r.ok) return result({ healthy: false, status: r.status }, true);
          const data = JSON.parse((await boundedBody(r, 16384, signal)).toString('utf8'));
          return result(
            { healthy: data?.status === 'ok', service: FILE_MANAGER_ORIGIN },
            data?.status !== 'ok',
          );
        } catch {
          return result({ healthy: false, code: 'HEALTH_CHECK_FAILED' }, true);
        }
      },
    },
    {
      name: 'FileManagerUpload',
      description:
        'Upload ONE explicitly approved final file from the current execution workspace to https://filemanage.ngrok.app and return a download link ONLY after byte/SHA-256 readback. Links are access-bearing, not proven private/expiring. Requires exact human file/destination sharing authorization, confirm_public_upload=true and existing runtime permissions; confirmation is not a grant. Never upload secrets or unrelated files. Paths on another host or private sandbox/artifact storage are not accepted; use authorized owner-scoped artifact transfer instead. Maximum25MiB; no automatic upload retry or external send.',
      parameters: {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description:
              'Existing non-hidden final file inside this execution workspace; never a remote-host or private artifact storage path.',
          },
          confirm_public_upload: {
            type: 'boolean',
            const: true,
            description:
              'True only after the human authorized publishing this exact file to this link-accessible service.',
          },
        },
        required: ['file_path', 'confirm_public_upload'],
        additionalProperties: false,
      },
      async run(args: Record<string, unknown>, ctx: Context): Promise<Result> {
        if (
          Object.keys(args).some((k) => !['file_path', 'confirm_public_upload'].includes(k)) ||
          args.confirm_public_upload !== true
        )
          return result(
            {
              status: 'not_uploaded',
              code: 'EXPLICIT_PUBLIC_UPLOAD_CONFIRMATION_REQUIRED',
              upload_attempted: false,
            },
            true,
          );
        try {
          return await uploadFileManagerSnapshot(
            await readFileManagerSnapshot(args.file_path, ctx),
            ctx,
            fetcher,
          );
        } catch (error) {
          return result(
            {
              status: 'not_uploaded',
              code:
                error instanceof TransferError
                  ? error.code
                  : ctx.signal.aborted
                    ? 'CANCELLED'
                    : 'FILE_NOT_AVAILABLE',
              upload_attempted: false,
              download_verified: false,
            },
            true,
          );
        }
      },
    },
  ];
}
export const fileManagerTools = createFileManagerTools();
