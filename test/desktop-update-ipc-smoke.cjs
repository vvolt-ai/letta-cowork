// Run under real Electron, not Electron-as-Node. Explicit private profile only.
const { app, BrowserWindow, ipcMain } = require('electron');
const assert = require('node:assert/strict');
const { resolve, join } = require('node:path');
const { pathToFileURL } = require('node:url');
if (!process.argv[2]) throw Error('Isolated profile path required');
app.setPath('userData', resolve(process.argv[2]));
app.disableHardwareAcceleration();
const timer = setTimeout(() => app.exit(1), 15000);
app
  .whenReady()
  .then(async () => {
    let window, unwire;
    try {
      const codeRoot = process.env.COWORK_UPDATE_FIXTURE_CODE_ROOT || join(__dirname, '../dist-electron');
      const { DesktopUpdateService } = await import(pathToFileURL(join(codeRoot, 'services/desktop-updates/update-service.js')).href);
      const { registerUpdateIpc } = await import(pathToFileURL(join(codeRoot, 'services/desktop-updates/update-ipc.js')).href);
      const url = pathToFileURL(join(__dirname, 'desktop-update-ipc.fixture.html')).href;
      window = new BrowserWindow({
        show: false,
        webPreferences: {
          preload: process.env.COWORK_UPDATE_FIXTURE_PRELOAD || join(codeRoot, 'preload.cjs'),
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
        },
      });
      let snooze,
        opened = 0,
        requests = 0;
      const service = new DesktopUpdateService({
        version: '1.0.2',
        platform: 'darwin',
        arch: 'arm64',
        isPackaged: true,
        now: Date.now,
        scope: () => ({
          key: 'isolated-fixture',
          fetchLatest: async () => {
            requests++;
            return {
              schemaVersion: 1,
              currentVersion: '1.0.2',
              status: 'available',
              release: {
                version: '1.0.3',
                platform: 'darwin',
                arch: 'arm64',
                format: 'dmg',
                notes: 'Fixture only',
                publishedAt: '2020-01-01T00:00:00Z',
                sha256: 'a'.repeat(64),
                downloadUrl: 'https://downloads.example.test/fixture.dmg',
              },
            };
          },
        }),
        readSnooze: () => snooze,
        writeSnooze: (value) => {
          snooze = value;
        },
        openDownload: async () => {
          opened++;
        },
        emit: (state) => window.webContents.send('desktop-updates:state', state),
      });
      unwire = registerUpdateIpc(
        window,
        service,
        ipcMain,
        (frame) => assert.equal(frame.url, url),
        () => !window.isDestroyed(),
      );
      await window.loadURL(url);
      const result = await window.webContents.executeJavaScript(
        `(async()=>{const events=[];const off=window.electron.onDesktopUpdateState(state=>events.push(state.status));const available=await window.electron.checkDesktopUpdates(true);const dismissed=await window.electron.dismissDesktopUpdate('1.0.3');const checked=await window.electron.checkDesktopUpdates(true);const download=await window.electron.downloadDesktopUpdate('1.0.3');off();return {available,dismissed,checked,download,events,node:typeof require};})()`,
      );
      assert.equal(result.available.status, 'available');
      assert.equal(result.available.showPrompt, true);
      assert.equal(result.dismissed.showPrompt, false);
      assert.equal(result.checked.showPrompt, true);
      assert.equal(result.download.opened, true);
      assert.equal(result.node, 'undefined');
      assert.ok(result.events.includes('available'));
      assert.ok(!JSON.stringify(result.available).includes('https://'));
      assert.equal(opened, 1);
      assert.equal(requests, 2);
      console.log(
        JSON.stringify({
          updatePreload: true,
          ipc: true,
          scope: true,
          snooze: true,
          manualCheck: true,
          downloadExplicit: true,
          browserActuallyOpened: false,
        }),
      );
      clearTimeout(timer);
      unwire();
      window.destroy();
      app.quit();
    } catch (error) {
      console.error(error);
      clearTimeout(timer);
      unwire?.();
      window?.destroy();
      app.exit(1);
    }
  })
  .catch((error) => {
    console.error(error);
    clearTimeout(timer);
    app.exit(1);
  });
