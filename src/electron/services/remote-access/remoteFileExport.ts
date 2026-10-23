import { constants, promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import path from 'node:path';
import { REMOTE_FILE_EXPORT_PYTHON } from './remoteFileExportPython.js';

export const REMOTE_FILE_EXPORT_TOOL = 'VeraReadFileForTransfer';
export const MAX_REMOTE_FILE_BYTES = 10 * 1024 * 1024;
export const remoteFileExportDefinition = {
  name: REMOTE_FILE_EXPORT_TOOL,
  description:
    'Internal authorized file-transfer transport. Bytes are returned only to the server transfer coordinator, never as model tool output.',
  parameters: {
    type: 'object',
    properties: { filePath: { type: 'string' } },
    required: ['filePath'],
    additionalProperties: false,
  },
};
function expandHome(value: string): string {
  return value === '~'
    ? homedir()
    : /^~[/\\]/.test(value)
      ? path.join(homedir(), value.slice(2))
      : value;
}
function within(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === '' ||
    (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..' + path.sep))
  );
}
function blocked(value: string): boolean {
  const parts = value.split(/[/\\]+/).map((part) => part.toLowerCase()),
    name = parts.at(-1) ?? '';
  return (
    parts.some((part) =>
      ['.ssh', '.aws', '.kube', '.git', 'auth', 'credentials', 'session', 'sessions'].includes(
        part,
      ),
    ) ||
    name === '.env' ||
    name.startsWith('.env.') ||
    [
      'cowork.env',
      '.cowork-token',
      'api-tokens.json',
      '.npmrc',
      '.netrc',
      'id_rsa',
      'id_ed25519',
    ].includes(name) ||
    /\.(?:pem|key|p12|pfx)$/.test(name)
  );
}
async function securePython(): Promise<string> {
  if (process.platform === 'win32') throw Error('REMOTE_FILE_SECURE_PLATFORM_UNSUPPORTED');
  const candidates = [
    '/opt/homebrew/bin/python3',
    '/usr/local/bin/python3',
    ...(process.platform === 'darwin'
      ? ['/Library/Developer/CommandLineTools/usr/bin/python3']
      : ['/usr/bin/python3']),
    ...(process.env.PATH ?? '')
      .split(path.delimiter)
      .filter(Boolean)
      .map((dir) => path.resolve(dir, 'python3')),
  ];
  for (const candidate of [...new Set(candidates)]) {
    // The macOS /usr/bin stub can launch a developer-tools installation prompt.
    if (process.platform === 'darwin' && candidate === '/usr/bin/python3') continue;
    try {
      await fs.access(candidate, constants.X_OK);
      return await fs.realpath(candidate);
    } catch {
      /* Try an already installed interpreter; never install one. */
    }
  }
  throw Error('REMOTE_FILE_TRANSFER_REQUIRES_PYTHON3');
}
async function readPinned(root: string, relative: string, signal: AbortSignal) {
  const python = await securePython();
  signal.throwIfAborted();
  return new Promise<{
    version: 1;
    fileName: string;
    size: number;
    sha256: string;
    base64: string;
  }>((resolve, reject) => {
    const child = spawn(python, ['-I', '-c', REMOTE_FILE_EXPORT_PYTHON], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' },
      windowsHide: true,
    });
    const chunks: Buffer[] = [];
    let size = 0,
      errorText = '',
      failure: Error | undefined;
    const stop = (error: Error) => {
      failure ??= error;
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    };
    const abort = () => stop(Error('REMOTE_FILE_CANCELLED'));
    const timer = setTimeout(() => stop(Error('REMOTE_FILE_TRANSFER_TIMEOUT')), 20000);
    const cleanup = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
    };
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    child.stdout.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > Math.ceil(MAX_REMOTE_FILE_BYTES / 3) * 4 + 4096) {
        stop(Error('REMOTE_FILE_TOO_LARGE'));
        return;
      }
      chunks.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      errorText = (errorText + String(chunk)).slice(0, 256);
    });
    child.once('error', () => {
      cleanup();
      reject(Error('REMOTE_FILE_SECURE_HELPER_UNAVAILABLE'));
    });
    child.once('close', (code) => {
      cleanup();
      if (failure) {
        reject(failure);
        return;
      }
      if (code !== 0) {
        reject(
          Error(
            /^REMOTE_FILE_[A-Z0-9_]+$/.test(errorText)
              ? errorText
              : 'REMOTE_FILE_SECURE_READ_DENIED',
          ),
        );
        return;
      }
      try {
        const file = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (
          file.version !== 1 ||
          !Number.isSafeInteger(file.size) ||
          file.size < 0 ||
          file.size > MAX_REMOTE_FILE_BYTES ||
          typeof file.base64 !== 'string' ||
          file.fileName !== path.basename(relative)
        )
          throw Error('REMOTE_FILE_METADATA_INVALID');
        const bytes = Buffer.from(file.base64, 'base64');
        if (
          bytes.length !== file.size ||
          bytes.toString('base64') !== file.base64 ||
          createHash('sha256').update(bytes).digest('hex') !== file.sha256
        )
          throw Error('REMOTE_FILE_INTEGRITY_FAILED');
        resolve(file);
      } catch {
        reject(Error('REMOTE_FILE_INTEGRITY_FAILED'));
      }
    });
    child.stdin.on('error', () => stop(Error('REMOTE_FILE_SECURE_HELPER_UNAVAILABLE')));
    child.stdin.end(JSON.stringify({ root, relative }));
  });
}
let activeExports = 0;
/** Node establishes the permitted canonical namespace; the isolated fixed
 * helper opens every component with openat/O_NOFOLLOW from pinned directories.
 * No pathname-based post-check or weaker fallback is used as containment proof. */
export async function exportRemoteFile(
  filePath: unknown,
  allowedDirectories: readonly string[],
  cwd: string | undefined,
  signal: AbortSignal,
) {
  if (activeExports >= 2) throw Error('REMOTE_FILE_TRANSFER_CAPACITY');
  activeExports++;
  try {
    signal.throwIfAborted();
    if (
      typeof filePath !== 'string' ||
      !filePath.trim() ||
      filePath.length > 8192 ||
      /[\x00-\x1f]/.test(filePath)
    )
      throw Error('REMOTE_FILE_PATH_INVALID');
    if (!allowedDirectories.length) throw Error('REMOTE_FILE_WORKSPACE_REQUIRED');
    const roots = await Promise.all(
      allowedDirectories.map(async (root) => {
        const lexical = path.resolve(expandHome(root));
        return { lexical, real: await fs.realpath(lexical) };
      }),
    );
    const base = path.resolve(expandHome(cwd ?? allowedDirectories[0])),
      requested = path.resolve(base, expandHome(filePath));
    if (!roots.some((root) => within(root.lexical, requested)) || blocked(requested))
      throw Error('REMOTE_FILE_PATH_DENIED');
    const lexical = await fs.lstat(requested);
    if (!lexical.isFile() || lexical.isSymbolicLink())
      throw Error('REMOTE_FILE_REGULAR_FILE_REQUIRED');
    if (lexical.size > MAX_REMOTE_FILE_BYTES) throw Error('REMOTE_FILE_TOO_LARGE');
    const canonical = await fs.realpath(requested);
    const root = roots
      .filter((root) => within(root.real, canonical))
      .sort((a, b) => b.real.length - a.real.length)[0];
    if (!root || blocked(canonical)) throw Error('REMOTE_FILE_PATH_DENIED');
    signal.throwIfAborted();
    return await readPinned(root.real, path.relative(root.real, canonical), signal);
  } finally {
    activeExports--;
  }
}
