declare const REMOTE_APP_ONLY: boolean;

/** Replaced by Vite at build time; no persisted setting can widen this shell. */
export const IS_REMOTE_APP_ONLY = typeof REMOTE_APP_ONLY !== 'undefined' && REMOTE_APP_ONLY;

export type RemoteOnlySection = 'profile' | 'remote-access';
export function remoteOnlySection(value: unknown): RemoteOnlySection {
  return value === 'profile' ? 'profile' : 'remote-access';
}
