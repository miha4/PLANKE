import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
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
    '## Data folder',
    '- Backend data is automatically stored in Electron userData/control-data (not in app folder).',
    '- This means unpacking location stays read-only-safe for media/db writes.',
  ].join('\n'),
  'utf8',
);

console.log(`Electron unpacked bundle prepared at: ${outDir}`);
