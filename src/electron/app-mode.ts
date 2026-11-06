import { readFileSync } from 'node:fs';

/** Build artifact, not a runtime environment override or an access grant. */
export function parsePackagedAppMode(value: unknown): boolean {
  if (!value || typeof value !== 'object' ||
    (value as { schemaVersion?: unknown; }).schemaVersion !== 1 ||
    typeof (value as { remoteAppOnly?: unknown; }).remoteAppOnly !== 'boolean') {
    throw new Error('App build-mode metadata is missing or invalid. Rebuild the app.');
  }
  return (value as { remoteAppOnly: boolean; }).remoteAppOnly;
}

export const REMOTE_APP_ONLY = parsePackagedAppMode(
  JSON.parse(readFileSync(new URL('./build-mode.json', import.meta.url), 'utf8')),
);
