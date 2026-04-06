import { app, BrowserWindow, globalShortcut, ipcMain } from 'electron';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { networkInterfaces } from 'node:os';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const envMode = process.env.APP_MODE; // launcher | control | player
const controlUrlFromEnv = process.env.CONTROL_URL;
const deviceId = process.env.DEVICE_ID || 'player-01';
const viteDevUrl = process.env.VITE_DEV_SERVER_URL || process.env.ELECTRON_RENDERER_URL || 'http://127.0.0.1:5173';
const controlPort = process.env.CONTROL_PORT || '8787';
const localhostControlUrl = `http://127.0.0.1:${controlPort}`;

let backendProcess;
let resolvedControlUrl = controlUrlFromEnv || localhostControlUrl;
let mode = 'launcher';
let mainWindow = null;
let configPath = '';
let appConfig = {
  startupMode: 'launcher', // launcher | admin | player
  playerFullscreen: true,
  preferredApiBase: '',
  progressBarEnabled: true,
  progressBarColor: '#3b82f6',
};

function normalizeMode(value) {
  if (value === 'control') return 'admin';
  if (value === 'admin' || value === 'player' || value === 'launcher') return value;
  return 'launcher';
}

function loadAppConfig() {
  try {
    if (!existsSync(configPath)) return;
    const raw = JSON.parse(readFileSync(configPath, 'utf8'));
    appConfig = {
      startupMode: normalizeMode(raw?.startupMode),
      playerFullscreen: raw?.playerFullscreen !== false,
      preferredApiBase: String(raw?.preferredApiBase ?? ''),
      progressBarEnabled: raw?.progressBarEnabled !== false,
      progressBarColor: String(raw?.progressBarColor ?? '#3b82f6'),
    };
  } catch {
    // ignore malformed config and continue with defaults
  }
}

function saveAppConfig(nextConfig) {
  appConfig = { ...appConfig, ...nextConfig };
  try {
    writeFileSync(configPath, JSON.stringify(appConfig, null, 2), 'utf8');
  } catch {
    // non-fatal; app continues with in-memory config
  }
}

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
  if (appConfig.preferredApiBase) {
    const preferredOrigin = appConfig.preferredApiBase.replace(/\/api\/?$/, '');
    if (await probeControlHealth(preferredOrigin)) return preferredOrigin;
  }

  if (await probeControlHealth(localhostControlUrl)) return localhostControlUrl;

  const reachableTarget = await findReachableControlUrl(getLanProbeTargets(controlPort));
  if (reachableTarget) return reachableTarget;

  return localhostControlUrl;
}

function startBackendIfNeeded() {
  if (mode === 'player') return;
  const controlDataDir = join(app.getPath('userData'), 'control-data');
  mkdirSync(controlDataDir, { recursive: true });
  backendProcess = spawn(process.execPath, [join(__dirname, '..', 'backend-control-server.mjs')], {
    stdio: 'inherit',
    env: { ...process.env, CONTROL_PORT: controlPort, CONTROL_DATA_DIR: controlDataDir },
  });
}

function createWindow() {
  const isPlayerFullscreen = mode === 'player' && appConfig.playerFullscreen;
  const win = new BrowserWindow({
    width: 1365,
    height: 768,
    autoHideMenuBar: true,
    kiosk: isPlayerFullscreen,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: join(__dirname, 'preload.mjs'),
    },
  });
  mainWindow = win;

  if (!app.isPackaged) {
    if (mode === 'control' || mode === 'admin') {
      win.loadURL(`${viteDevUrl}/admin?apiBase=${encodeURIComponent(resolvedControlUrl + '/api')}`);
    } else if (mode === 'player') {
      win.loadURL(`${viteDevUrl}/player?deviceId=${encodeURIComponent(deviceId)}&apiBase=${encodeURIComponent(resolvedControlUrl + '/api')}`);
    } else {
      win.loadURL(`${viteDevUrl}/launcher?apiBase=${encodeURIComponent(resolvedControlUrl + '/api')}`);
    }
    return;
  }

  const indexPath = join(__dirname, '..', 'dist', 'index.html');
  const playerPath = join(__dirname, '..', 'dist', 'index.html');
  if (mode === 'control' || mode === 'admin') {
    win.loadFile(indexPath, { hash: '/admin', query: { apiBase: `${resolvedControlUrl}/api` } });
  } else if (mode === 'player') {
    win.loadFile(playerPath, { hash: '/player', query: { deviceId, apiBase: `${resolvedControlUrl}/api` } });
  } else {
    win.loadFile(indexPath, { hash: '/launcher', query: { apiBase: `${resolvedControlUrl}/api` } });
  }
}

function navigateMainWindow(targetMode) {
  if (!mainWindow) return;
  mode = targetMode;
  mainWindow.setKiosk(mode === 'player' && appConfig.playerFullscreen);

  if (!app.isPackaged) {
    if (mode === 'player') {
      mainWindow.loadURL(`${viteDevUrl}/player?deviceId=${encodeURIComponent(deviceId)}&apiBase=${encodeURIComponent(resolvedControlUrl + '/api')}`);
    } else if (mode === 'admin' || mode === 'control') {
      mainWindow.loadURL(`${viteDevUrl}/admin?apiBase=${encodeURIComponent(resolvedControlUrl + '/api')}`);
    } else {
      mainWindow.loadURL(`${viteDevUrl}/launcher?apiBase=${encodeURIComponent(resolvedControlUrl + '/api')}`);
    }
    return;
  }

  const indexPath = join(__dirname, '..', 'dist', 'index.html');
  if (mode === 'player') {
    mainWindow.loadFile(indexPath, { hash: '/player', query: { deviceId, apiBase: `${resolvedControlUrl}/api` } });
  } else if (mode === 'admin' || mode === 'control') {
    mainWindow.loadFile(indexPath, { hash: '/admin', query: { apiBase: `${resolvedControlUrl}/api` } });
  } else {
    mainWindow.loadFile(indexPath, { hash: '/launcher', query: { apiBase: `${resolvedControlUrl}/api` } });
  }
}

app.whenReady().then(async () => {
  const configDir = app.getPath('userData');
  mkdirSync(configDir, { recursive: true });
  configPath = join(configDir, 'app-config.json');
  loadAppConfig();
  mode = envMode ? normalizeMode(envMode) : appConfig.startupMode;

  ipcMain.handle('app-config:get', () => ({
    ...appConfig,
    mode,
    resolvedControlUrl,
    controlPort,
    preferredApiBase: appConfig.preferredApiBase,
  }));

  ipcMain.handle('app-config:set', (_event, nextConfig) => {
    saveAppConfig({
      startupMode: normalizeMode(nextConfig?.startupMode),
      playerFullscreen: nextConfig?.playerFullscreen !== false,
      preferredApiBase: String(nextConfig?.preferredApiBase ?? appConfig.preferredApiBase ?? ''),
      progressBarEnabled: nextConfig?.progressBarEnabled !== false,
      progressBarColor: String(nextConfig?.progressBarColor ?? appConfig.progressBarColor ?? '#3b82f6'),
    });
    navigateMainWindow(appConfig.startupMode);
    return appConfig;
  });

  ipcMain.handle('app:open-settings', () => {
    navigateMainWindow('launcher');
    return true;
  });

  globalShortcut.register('CommandOrControl+Shift+F12', () => {
    navigateMainWindow('launcher');
  });

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
  globalShortcut.unregisterAll();
  if (backendProcess) {
    backendProcess.kill('SIGTERM');
  }
});
