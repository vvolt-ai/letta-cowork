/** Electron 44+ removed openAsHidden/wasOpenedAsHidden. Preserve hidden
 * login launch without those removed fields or any OS-setting changes here. */
export function shouldLaunchHidden(
  argv: readonly string[],
  platform: NodeJS.Platform,
  login: { wasOpenedAtLogin?: boolean } = {},
): boolean {
  return argv.includes('--hidden') || (platform === 'darwin' && login.wasOpenedAtLogin === true);
}
export function supportsLoginItems(platform: NodeJS.Platform): boolean {
  return platform === 'darwin' || platform === 'win32';
}
