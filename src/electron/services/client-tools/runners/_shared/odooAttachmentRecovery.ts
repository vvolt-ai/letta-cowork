import { createHash } from 'node:crypto';
import { access, mkdir, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface AttachmentRecovery {
  has(key: string, phase: 'attachment' | 'note'): Promise<boolean>;
  mark(key: string, phase: 'attachment' | 'note'): Promise<void>;
  clear(key: string, phase: 'attachment' | 'note'): Promise<void>;
}

/** Durable intent markers contain no PDF data, credentials, or machine-local source paths. */
export function fileAttachmentRecovery(
  root = join(homedir(), '.letta-cowork', 'attachment-recovery'),
): AttachmentRecovery {
  const file = (key: string, phase: string) =>
    join(root, `${createHash('sha256').update(key).digest('hex')}-${phase}.json`);
  return {
    async has(key, phase) {
      try {
        await access(file(key, phase));
        return true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
        throw error;
      }
    },
    async mark(key, phase) {
      await mkdir(root, { recursive: true, mode: 0o700 });
      // Exclusive intent creation prevents another local process from repeating an unresolved write.
      await writeFile(file(key, phase), JSON.stringify({ version: 1, phase }), {
        flag: 'wx',
        mode: 0o600,
      });
    },
    async clear(key, phase) {
      try {
        await unlink(file(key, phase));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    },
  };
}
