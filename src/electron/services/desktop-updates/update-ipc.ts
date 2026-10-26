import type { BrowserWindow, IpcMain, IpcMainInvokeEvent, WebFrameMain } from 'electron';
import type { DesktopUpdateService } from './update-service.js';
export function registerUpdateIpc(
  window: BrowserWindow,
  service: Pick<DesktopUpdateService, 'getState' | 'check' | 'dismiss' | 'download'>,
  ipc: Pick<IpcMain, 'handle' | 'removeHandler'>,
  validateFrame: (frame: WebFrameMain) => void,
  alive: () => boolean,
) {
  const authorize = (event: IpcMainInvokeEvent) => {
    if (
      !alive() ||
      event.sender !== window.webContents ||
      !event.senderFrame ||
      event.senderFrame !== window.webContents.mainFrame
    )
      throw Error('Untrusted update request');
    validateFrame(event.senderFrame);
  };
  const channels = [
    'desktop-updates:get',
    'desktop-updates:check',
    'desktop-updates:dismiss',
    'desktop-updates:download',
  ];
  ipc.handle(channels[0], (event) => {
    authorize(event);
    return service.getState();
  });
  ipc.handle(channels[1], (event, manual: unknown) => {
    authorize(event);
    if (manual !== undefined && typeof manual !== 'boolean') throw Error('Invalid update check');
    return service.check(manual !== false);
  });
  ipc.handle(channels[2], (event, version: unknown) => {
    authorize(event);
    return service.dismiss(version);
  });
  ipc.handle(channels[3], (event, version: unknown) => {
    authorize(event);
    return service.download(version);
  });
  return () => {
    for (const channel of channels) ipc.removeHandler(channel);
  };
}
