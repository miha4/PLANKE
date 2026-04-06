export interface ContentItem {
  id: string;
  name: string;
  type: 'image' | 'video';
  dataUrl: string;
  displayDurationSeconds: number; // for images, default 10
  startDate: string; // ISO date string — when to start showing
  endDate: string;   // ISO date string — when to stop showing
  createdAt: string;
  order: number;
}

export interface FtpConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  remotePath: string;
  enabled: boolean;
}

const STORAGE_KEY = 'ad-player-content';
const DEFAULT_IMAGE_KEY = 'ad-player-default-image';
const FTP_CONFIG_KEY = 'ad-player-ftp-config';

export function getActiveContentItems(): ContentItem[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    const items: ContentItem[] = JSON.parse(data);
    const now = new Date();
    return items
      .filter(item => new Date(item.startDate) <= now && new Date(item.endDate) > now)
      .sort((a, b) => a.order - b.order);
  } catch {
    return [];
  }
}

export function getAllContentItems(): ContentItem[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    return (JSON.parse(data) as ContentItem[]).sort((a, b) => a.order - b.order);
  } catch {
    return [];
  }
}

export function saveContentItems(items: ContentItem[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function addContentItem(item: Omit<ContentItem, 'id' | 'createdAt' | 'order'>): ContentItem {
  const items = getAllContentItems();
  const newItem: ContentItem = {
    ...item,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    order: items.length,
  };
  items.push(newItem);
  saveContentItems(items);
  return newItem;
}

export function removeContentItem(id: string): void {
  const items = getAllContentItems().filter(item => item.id !== id);
  saveContentItems(items);
}

export function updateContentItem(id: string, updates: Partial<ContentItem>): void {
  const items = getAllContentItems().map(item =>
    item.id === id ? { ...item, ...updates } : item
  );
  saveContentItems(items);
}

// Default image
export function getDefaultImage(): string | null {
  return localStorage.getItem(DEFAULT_IMAGE_KEY);
}

export function setDefaultImage(dataUrl: string): void {
  localStorage.setItem(DEFAULT_IMAGE_KEY, dataUrl);
}

export function removeDefaultImage(): void {
  localStorage.removeItem(DEFAULT_IMAGE_KEY);
}

// FTP config
export function getFtpConfig(): FtpConfig {
  try {
    const data = localStorage.getItem(FTP_CONFIG_KEY);
    if (data) return JSON.parse(data);
  } catch {}
  return { host: '', port: 21, username: '', password: '', remotePath: '/ads', enabled: false };
}

export function saveFtpConfig(config: FtpConfig): void {
  localStorage.setItem(FTP_CONFIG_KEY, JSON.stringify(config));
}
