import { app, BrowserWindow } from 'electron';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { networkInterfaces } from 'node:os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const mode = process.env.APP_MODE || 'launcher'; // launcher | control | player
const controlUrlFromEnv = process.env.CONTROL_URL;
const deviceId = process.env.DEVICE_ID || 'player-01';
const viteDevUrl = process.env.VITE_DEV_SERVER_URL || process.env.ELECTRON_RENDERER_URL || 'http://127.0.0.1:5173';
const controlPort = process.env.CONTROL_PORT || '8787';
const localhostControlUrl = `http://127.0.0.1:${controlPort}`;

let backendProcess;
let resolvedControlUrl = controlUrlFromEnv || localhostControlUrl;

async function probeControlHealth(baseUrl) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 800);

  try {
    const response = await fetch(`${baseUrl}/api/health`, {
      method: 'GET',
      signal: controller.signal,
    });
    if (!response.ok) return false;
    const data = await response.json().catch(() => null);
    return Boolean(data?.ok);
  } catch {
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}

function getLanProbeTargets(port) {
  const candidates = new Set();
  const interfaces = networkInterfaces();

  for (const nets of Object.values(interfaces)) {
    for (const net of nets || []) {
      if (net.family !== 'IPv4' || net.internal || !net.address) continue;
      const ip = net.address;
      if (
        ip.startsWith('10.')
        || ip.startsWith('192.168.')
        || /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)
      ) {
        const octets = ip.split('.');
        if (octets.length === 4) {
          const prefix = `${octets[0]}.${octets[1]}.${octets[2]}`;
          for (let host = 1; host <= 254; host += 1) {
            const targetIp = `${prefix}.${host}`;
            if (targetIp !== ip) candidates.add(`http://${targetIp}:${port}`);
          }
          candidates.add(`http://${ip}:${port}`);
        }
      }
    }
  }

  return [...candidates];
}

async function findReachableControlUrl(targets) {
  const batchSize = 24;
  for (let start = 0; start < targets.length; start += batchSize) {
    const batch = targets.slice(start, start + batchSize);
    const probeResults = await Promise.all(batch.map(async target => ({
      target,
      healthy: await probeControlHealth(target),
    })));
    const match = probeResults.find(result => result.healthy);
    if (match) return match.target;
  }
  return null;
}

async function resolveControlUrl() {
  if (mode === 'control') return localhostControlUrl;
  if (controlUrlFromEnv?.trim()) return controlUrlFromEnv;

  if (await probeControlHealth(localhostControlUrl)) return localhostControlUrl;

  const reachableTarget = await findReachableControlUrl(getLanProbeTargets(controlPort));
  if (reachableTarget) return reachableTarget;

  return localhostControlUrl;
}

function startBackendIfNeeded() {
  if (mode === 'player') return;
  backendProcess = spawn(process.execPath, [join(__dirname, '..', 'backend-control-server.mjs')], {
    stdio: 'inherit',
    env: { ...process.env, CONTROL_PORT: controlPort },
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
      win.loadURL(`${viteDevUrl}/?apiBase=${encodeURIComponent(resolvedControlUrl + '/api')}`);
    } else if (mode === 'player') {
      win.loadURL(`${viteDevUrl}/player?deviceId=${encodeURIComponent(deviceId)}&apiBase=${encodeURIComponent(resolvedControlUrl + '/api')}`);
    } else {
      win.loadURL(`${viteDevUrl}/launcher?apiBase=${encodeURIComponent(resolvedControlUrl + '/api')}`);
    }
    return;
  }

  const indexPath = join(__dirname, '..', 'dist', 'index.html');
  const playerPath = join(__dirname, '..', 'dist', 'index.html');
  if (mode === 'control') {
    win.loadFile(indexPath, { query: { apiBase: `${resolvedControlUrl}/api` } });
  } else if (mode === 'player') {
    win.loadFile(playerPath, { hash: '/player', query: { deviceId, apiBase: `${resolvedControlUrl}/api` } });
  } else {
    win.loadFile(indexPath, { hash: '/launcher', query: { apiBase: `${resolvedControlUrl}/api` } });
  }
}

app.whenReady().then(async () => {
  startBackendIfNeeded();
  resolvedControlUrl = await resolveControlUrl();
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
