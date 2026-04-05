import {
  ContentItem,
  FtpConfig,
  getAllContentItems,
  getActiveContentItems,
  addContentItem as addLocal,
  removeContentItem as removeLocal,
  updateContentItem as updateLocal,
  getDefaultImage as getDefaultLocal,
  setDefaultImage as setDefaultLocal,
  removeDefaultImage as removeDefaultLocal,
  getFtpConfig as getFtpLocal,
  saveFtpConfig as saveFtpLocal,
} from './content-store';

function getApiBase() {
  const url = new URL(window.location.href);
  return url.searchParams.get('apiBase') || import.meta.env.VITE_API_BASE || 'http://localhost:8787/api';
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getApiBase()}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    ...init,
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function getAllContentItemsAsync(): Promise<ContentItem[]> {
  try {
    return await request<ContentItem[]>('/content');
  } catch {
    return getAllContentItems();
  }
}

export async function getActiveContentItemsAsync(): Promise<ContentItem[]> {
  try {
    return await request<ContentItem[]>('/content/active');
  } catch {
    return getActiveContentItems();
  }
}

export async function addContentItemAsync(item: Omit<ContentItem, 'id' | 'createdAt' | 'order'>): Promise<ContentItem> {
  try {
    return await request<ContentItem>('/content', { method: 'POST', body: JSON.stringify(item) });
  } catch {
    return addLocal(item);
  }
}

export async function removeContentItemAsync(id: string): Promise<void> {
  try {
    await request<void>(`/content/${id}`, { method: 'DELETE' });
  } catch {
    removeLocal(id);
  }
}

export async function updateContentItemAsync(id: string, updates: Partial<ContentItem>): Promise<void> {
  try {
    await request<void>(`/content/${id}`, { method: 'PATCH', body: JSON.stringify(updates) });
  } catch {
    updateLocal(id, updates);
  }
}

export async function getDefaultImageAsync(): Promise<string | null> {
  try {
    const result = await request<{ dataUrl: string | null }>('/default-image');
    return result.dataUrl;
  } catch {
    return getDefaultLocal();
  }
}

export async function setDefaultImageAsync(dataUrl: string): Promise<void> {
  try {
    await request('/default-image', { method: 'PUT', body: JSON.stringify({ dataUrl }) });
  } catch {
    setDefaultLocal(dataUrl);
  }
}

export async function removeDefaultImageAsync(): Promise<void> {
  try {
    await request('/default-image', { method: 'DELETE' });
  } catch {
    removeDefaultLocal();
  }
}

export async function getFtpConfigAsync(): Promise<FtpConfig> {
  try {
    return await request<FtpConfig>('/ftp-config');
  } catch {
    return getFtpLocal();
  }
}

export async function saveFtpConfigAsync(config: FtpConfig): Promise<void> {
  try {
    await request('/ftp-config', { method: 'PUT', body: JSON.stringify(config) });
  } catch {
    saveFtpLocal(config);
  }
}
