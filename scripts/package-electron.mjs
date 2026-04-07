import { cpSync, mkdirSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const outDir = join(root, 'release', 'electron-unpacked');

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

for (const item of ['dist', 'electron', 'backend-control-server.mjs', 'package.json']) {
  cpSync(join(root, item), join(outDir, item), { recursive: true });
}

writeFileSync(
  join(outDir, 'RUN.md'),
  [
    '# PLANKE Electron unpacked build',
    '',
    '## Run',
    '1. Install dependencies in this folder (or copy node_modules from source project):',
    '   npm install --omit=dev',
    '2. Start app:',
    '   npx electron .',
    '',
    '   or use helper launchers in this folder:',
    '   - ./start-mac-linux.sh',
    '   - start-windows.bat',
    '',
    '## Data folder',
    '- Backend data is automatically stored in Electron userData/control-data (not in app folder).',
    '- This means unpacking location stays read-only-safe for media/db writes.',
  ].join('\n'),
  'utf8',
);

const startSh = join(outDir, 'start-mac-linux.sh');
writeFileSync(
  startSh,
  [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    'if [ ! -d node_modules ]; then',
    '  npm install --omit=dev',
    'fi',
    'npx electron .',
    '',
  ].join('\n'),
  'utf8',
);
chmodSync(startSh, 0o755);

writeFileSync(
  join(outDir, 'start-windows.bat'),
  [
    '@echo off',
    'if not exist node_modules (',
    '  call npm install --omit=dev',
    ')',
    'call npx electron .',
    '',
  ].join('\r\n'),
  'utf8',
);

console.log(`Electron unpacked bundle prepared at: ${outDir}`);
console.log('Next step: open release/electron-unpacked/RUN.md');
