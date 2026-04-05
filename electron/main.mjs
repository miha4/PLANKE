import { app, BrowserWindow } from 'electron';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const mode = process.env.APP_MODE || 'control'; // control | player
const controlUrl = process.env.CONTROL_URL || 'http://localhost:8787';
const deviceId = process.env.DEVICE_ID || 'player-01';
const viteDevUrl = process.env.VITE_DEV_SERVER_URL || process.env.ELECTRON_RENDERER_URL || 'http://127.0.0.1:5173';

let backendProcess;

function startBackendIfNeeded() {
  if (mode !== 'control') return;
  backendProcess = spawn(process.execPath, [join(__dirname, '..', 'backend-control-server.mjs')], {
    stdio: 'inherit',
    env: { ...process.env, CONTROL_PORT: process.env.CONTROL_PORT || '8787' },
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1365,
    height: 768,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (!app.isPackaged) {
    if (mode === 'control') {
      win.loadURL(`${viteDevUrl}/?apiBase=${encodeURIComponent(controlUrl + '/api')}`);
    } else {
      win.loadURL(`${viteDevUrl}/player?deviceId=${encodeURIComponent(deviceId)}&apiBase=${encodeURIComponent(controlUrl + '/api')}`);
    }
    return;
  }

  const indexPath = join(__dirname, '..', 'dist', 'index.html');
  const playerPath = join(__dirname, '..', 'dist', 'index.html');
  if (mode === 'control') {
    win.loadFile(indexPath, { query: { apiBase: `${controlUrl}/api` } });
  } else {
    win.loadFile(playerPath, { hash: '/player', query: { deviceId, apiBase: `${controlUrl}/api` } });
  }
}

app.whenReady().then(() => {
  startBackendIfNeeded();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (backendProcess) {
    backendProcess.kill('SIGTERM');
  }
});
