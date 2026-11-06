export function parseRemoteAppOnly(value: string | undefined): boolean;
export function resolveAppBuildMode(mode?: string, cwd?: string): { schemaVersion: 1; remoteAppOnly: boolean; };
