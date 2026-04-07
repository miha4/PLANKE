import { app, BrowserWindow, dialog, globalShortcut, ipcMain } from 'electron';
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
const useDevServer = process.env.USE_DEV_SERVER === '1';
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
  storageDir: '',
  playerChannel: 'A',
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
      storageDir: String(raw?.storageDir ?? ''),
      playerChannel: raw?.playerChannel === 'B' || raw?.playerChannel === 'C' ? raw.playerChannel : 'A',
    };
  } catch {
    console.error('[electron] Failed to parse app config:', configPath);
  }
}

function saveAppConfig(nextConfig) {
  appConfig = { ...appConfig, ...nextConfig };
  try {
    writeFileSync(configPath, JSON.stringify(appConfig, null, 2), 'utf8');
  } catch {
    console.error('[electron] Failed to save app config:', configPath);
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
  const controlDataDir = appConfig.storageDir?.trim() || join(app.getPath('userData'), 'control-data');
  mkdirSync(controlDataDir, { recursive: true });
  const backendScriptPath = join(__dirname, '..', 'backend-control-server.mjs');
  backendProcess = spawn(process.execPath, [backendScriptPath], {
    stdio: 'inherit',
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      CONTROL_PORT: controlPort,
      CONTROL_DATA_DIR: controlDataDir,
    },
  });
  console.log('[electron] Backend process started:', { executable: process.execPath, backendScriptPath, controlPort });

  backendProcess.on('error', (error) => {
    console.error('[electron] Backend start failed:', error);
  });

  backendProcess.on('exit', (code, signal) => {
    if (!app.isQuitting) {
      console.error(`[electron] Backend exited unexpectedly (code=${code}, signal=${signal})`);
    }
  });
}

function stopBackendIfRunning() {
  if (backendProcess) {
    backendProcess.kill('SIGTERM');
    backendProcess = undefined;
  }
}

function restartBackendIfNeeded() {
  if (mode === 'player') return;
  stopBackendIfRunning();
  startBackendIfNeeded();
}

function getRouteForMode(targetMode) {
  if (targetMode === 'player') return '/player';
  if (targetMode === 'admin' || targetMode === 'control') return '/admin';
  return '/launcher';
}

function buildRouteQuery(targetMode) {
  const query = { apiBase: `${resolvedControlUrl}/api` };
  if (targetMode === 'player') {
    return { ...query, deviceId, channel: appConfig.playerChannel || 'A' };
  }
  return query;
}

function logWindowFailure(win) {
  win.webContents.on('did-fail-load', (_event, code, description, validatedURL, isMainFrame) => {
    if (!isMainFrame) return;
    console.error('[electron] Frontend load failed:', { code, description, validatedURL });
  });

  win.webContents.on('render-process-gone', (_event, details) => {
    console.error('[electron] Render process gone:', details);
  });

  win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (level >= 2) {
      console.error(`[renderer:${level}] ${message} (${sourceId}:${line})`);
    }
  });
}

function loadFrontend(win, targetMode) {
  const route = getRouteForMode(targetMode);
  const query = buildRouteQuery(targetMode);

  if (useDevServer) {
    const devUrl = new URL(viteDevUrl);
    devUrl.hash = route;
    for (const [key, value] of Object.entries(query)) {
      devUrl.searchParams.set(key, value);
    }
    console.log('[electron] Loading frontend from dev server:', devUrl.toString());
    return win.loadURL(devUrl.toString());
  }

  const indexPath = join(__dirname, '..', 'dist', 'index.html');
  console.log('[electron] Loading frontend from file:', indexPath, route, query);
  return win.loadFile(indexPath, { hash: route, query });
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
      preload: join(__dirname, 'preload.js'),
    },
  });

  mainWindow = win;
  logWindowFailure(win);

  loadFrontend(win, mode).catch((error) => {
    console.error('[electron] Failed to load frontend:', error);
  });
}

function navigateMainWindow(targetMode) {
  if (!mainWindow) return;
  mode = targetMode;
  mainWindow.setKiosk(mode === 'player' && appConfig.playerFullscreen);

  loadFrontend(mainWindow, mode).catch((error) => {
    console.error('[electron] Failed to navigate main window:', error);
  });
}

app.whenReady().then(async () => {
  app.isQuitting = false;
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
    storageDir: appConfig.storageDir,
    playerChannel: appConfig.playerChannel,
  }));

  ipcMain.handle('app-config:set', (_event, nextConfig) => {
    const previousStorageDir = appConfig.storageDir;
    saveAppConfig({
      startupMode: normalizeMode(nextConfig?.startupMode),
      playerFullscreen: nextConfig?.playerFullscreen !== false,
      preferredApiBase: String(nextConfig?.preferredApiBase ?? appConfig.preferredApiBase ?? ''),
      progressBarEnabled: nextConfig?.progressBarEnabled !== false,
      progressBarColor: String(nextConfig?.progressBarColor ?? appConfig.progressBarColor ?? '#3b82f6'),
      storageDir: String(nextConfig?.storageDir ?? appConfig.storageDir ?? ''),
      playerChannel: nextConfig?.playerChannel === 'B' || nextConfig?.playerChannel === 'C' ? nextConfig.playerChannel : 'A',
    });
    if (appConfig.storageDir !== previousStorageDir) {
      restartBackendIfNeeded();
    }
    navigateMainWindow(appConfig.startupMode);
    return appConfig;
  });

  ipcMain.handle('app:select-storage-dir', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: appConfig.storageDir?.trim() || join(app.getPath('userData'), 'control-data'),
      title: 'Izberi mapo za podatke PLANKE',
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const selectedDir = result.filePaths[0];
    saveAppConfig({ storageDir: selectedDir });
    restartBackendIfNeeded();
    resolvedControlUrl = await resolveControlUrl();
    return selectedDir;
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
}).catch((error) => {
  console.error('[electron] App failed during startup:', error);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  app.isQuitting = true;
  globalShortcut.unregisterAll();
  stopBackendIfRunning();
});
