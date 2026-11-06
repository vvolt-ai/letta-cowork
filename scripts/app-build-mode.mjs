import { loadEnv } from 'vite';

export function parseRemoteAppOnly(value) {
  if (value === undefined || value === '' || value === 'false') return false;
  if (value === 'true') return true;
  throw new Error('REMOTE_APP_ONLY must be true or false.');
}

export function resolveAppBuildMode(mode = 'production', cwd = process.cwd()) {
  return { schemaVersion: 1, remoteAppOnly: parseRemoteAppOnly(loadEnv(mode, cwd, '').REMOTE_APP_ONLY) };
}
