import { resolve } from 'node:path';
export interface MemoryPushRequest { confirm: boolean; expectedRevision: string; signal?: AbortSignal; }
export interface MemoryPushReceipt { agentId: string; repository: 'memory'; state: 'pushed' | 'up_to_date' | 'unverified'; revision: string; remoteRevision?: string; verified: boolean; errorCode?: string; }
type Git = (args: string[], authenticated?: boolean) => Promise<{ stdout: string ;}>;
const SHA = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/i;
/** Explicit committed-primary publication only. This helper never commits,
 * selects branches, merges, rewrites history, enables repositories or retries a push. */
export async function pushMemoryCommit(input: { agentId: string; path: string; remote: string; expectedRevision: string; git: Git; guard: () => void ;}): Promise<MemoryPushReceipt> {
  const { git, guard, expectedRevision: revision } = input;
  if (!SHA.test(revision)) throw Error('MEMORY_PUSH_EXPECTED_REVISION_REQUIRED');
  guard();
  const names = (await git(['config', '--local', '--name-only', '--list'])).stdout.split(/\r?\n/);
  if (names.some(name => /^(url\.|include(?:if)?\.|http\.|remote\..*\.proxy|core\.(?:fsmonitor|sshcommand|gitproxy)$|filter\.|extensions\.(?:worktreeconfig|partialclone)$)/i.test(name))) throw Error('MEMORY_PUSH_UNSAFE_LOCAL_CONFIG');
  if (resolve((await git(['rev-parse', '--show-toplevel'])).stdout.trim()) !== resolve(input.path)) throw Error('MEMORY_PUSH_WORKTREE_MISMATCH');
  const gitRoot=resolve(input.path,'.git');
  if(resolve((await git(['rev-parse','--absolute-git-dir'])).stdout.trim())!==gitRoot||resolve(input.path,(await git(['rev-parse','--git-common-dir'])).stdout.trim())!==gitRoot)throw Error('MEMORY_PUSH_GIT_DIRECTORY_MISMATCH');
  if ((await git(['remote', 'get-url', '--all', 'origin'])).stdout.trim() !== input.remote) throw Error('REMOTE_IDENTITY_MISMATCH');
  if ((await git(['rev-parse', '--verify', 'HEAD'])).stdout.trim() !== revision) throw Error('MEMORY_PUSH_REVISION_CHANGED');
  if ((await git(['status', '--porcelain=v1', '--untracked-files=all', '-z'])).stdout) throw Error('LOCAL_CHANGES_PRESERVED');
  const ref = (await git(['symbolic-ref', '--quiet', 'HEAD'])).stdout.trim();
  if (!/^refs\/heads\/[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(ref)) throw Error('MEMORY_PUSH_BRANCH_UNAVAILABLE');
  await git(['check-ref-format', ref]); guard();
  // URL plus exact existing ref: no pushurl, mirror/default refspec, tag or
  // branch creation. Fetch writes FETCH_HEAD only; local history is not merged.
  await git(['fetch', '--no-tags', '--no-recurse-submodules', '--', input.remote, ref], true); guard();
  const before = (await git(['rev-parse', '--verify', 'FETCH_HEAD'])).stdout.trim();
  if (!SHA.test(before)) throw Error('MEMORY_PUSH_INVALID_REMOTE_REVISION');
  const behind = (await git(['rev-list', '--count', `${revision}..${before}`])).stdout.trim();
  if (!/^\d+$/.test(behind)) throw Error('MEMORY_PUSH_INVALID_HISTORY');
  if (Number(behind) !== 0) throw Error('MEMORY_PUSH_REMOTE_CHANGES_PRESERVED');
  if ((await git(['rev-parse', '--verify', 'HEAD'])).stdout.trim() !== revision) throw Error('MEMORY_PUSH_REVISION_CHANGED');
  if ((await git(['status', '--porcelain=v1', '--untracked-files=all', '-z'])).stdout) throw Error('LOCAL_CHANGES_PRESERVED');
  guard();
  const readBack = async () => {
    const rows = (await git(['ls-remote', '--refs', '--', input.remote, ref], true)).stdout.trim().split(/\r?\n/).filter(Boolean);
    if (rows.length !== 1) return undefined; const [sha, name] = rows[0].split(/\s+/); return name === ref && SHA.test(sha) ? sha : undefined;
  };
  if (before === revision) { guard(); const remoteRevision = await readBack(); guard(); if (remoteRevision !== revision) throw Error('MEMORY_PUSH_REMOTE_CHANGED'); return { agentId: input.agentId, repository: 'memory', state: 'up_to_date', revision, remoteRevision, verified: true }; }
  // One dispatch only. A transport failure can occur after acceptance, so read
  // the exact remote ref even after a failed command rather than replaying it.
  try { await git(['push', '--porcelain', '--no-follow-tags', '--recurse-submodules=no', '--', input.remote, `${revision}:${ref}`], true); } catch {/* outcome is determined below, never guessed from exit status */ }
  let remoteRevision: string | undefined;
  try { guard(); remoteRevision = await readBack(); guard(); } catch {
    return { agentId: input.agentId, repository: 'memory', state: 'unverified', revision, verified: false, errorCode: 'MEMORY_PUSH_OUTCOME_UNVERIFIED' };
  }
  if (remoteRevision !== revision) return { agentId: input.agentId, repository: 'memory', state: 'unverified', revision, remoteRevision, verified: false, errorCode: 'MEMORY_PUSH_OUTCOME_UNVERIFIED' };
  return { agentId: input.agentId, repository: 'memory', state: 'pushed', revision, remoteRevision, verified: true };
}
