/// <reference types="vite/client" />

interface ElectronAppConfig {
  startupMode: 'launcher' | 'admin' | 'player';
  playerFullscreen: boolean;
  mode: 'launcher' | 'admin' | 'player';
  resolvedControlUrl: string;
  controlPort: string;
}

interface Window {
  electronApp?: {
    getConfig: () => Promise<ElectronAppConfig>;
    setConfig: (config: Partial<ElectronAppConfig>) => Promise<ElectronAppConfig>;
    openSettings: () => Promise<boolean>;
  };
}
