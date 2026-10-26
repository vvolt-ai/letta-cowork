export type DesktopUpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'up-to-date'
  | 'unconfigured'
  | 'unsupported'
  | 'error'
  | 'signed-out';
export interface DesktopReleaseSummary {
  version: string;
  publishedAt: string;
  notes: string;
  format: 'dmg' | 'exe' | 'tar.xz';
  sha256: string;
  minimumOsVersion?: string;
}
export interface DesktopUpdateState {
  revision: number;
  currentVersion: string;
  platform: string;
  arch: string;
  status: DesktopUpdateStatus;
  showPrompt: boolean;
  release?: DesktopReleaseSummary;
  lastCheckedAt?: number;
  message?: string;
  downloadOpened?: boolean;
}
