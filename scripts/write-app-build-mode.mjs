import { mkdir, writeFile } from 'node:fs/promises';
import { resolveAppBuildMode } from './app-build-mode.mjs';

const config = resolveAppBuildMode(process.env.NODE_ENV === 'development' ? 'development' : 'production');
const output = new URL('../dist-electron/', import.meta.url);
await mkdir(output, { recursive: true });
await writeFile(new URL('build-mode.json', output), JSON.stringify(config) + '\n');
console.log(`App build mode: ${config.remoteAppOnly ? 'remote-only' : 'full'}`);
