import { ContentItem } from './content-store';

function getApiBase() {
  const url = new URL(window.location.href);
  return url.searchParams.get('apiBase') || import.meta.env.VITE_API_BASE || 'http://localhost:8787/api';
}

function getBackendOrigin() {
  return new URL(getApiBase()).origin;
}

function normalizeMediaUrl(url: string | null | undefined) {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) return url;
  if (url.startsWith('/')) return `${getBackendOrigin()}${url}`;
  return `${getBackendOrigin()}/${url}`;
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
  const items = await request<ContentItem[]>('/content');
  return items.map(item => ({ ...item, dataUrl: normalizeMediaUrl(item.dataUrl) ?? '' }));
}

export async function getActiveContentItemsAsync(): Promise<ContentItem[]> {
  const items = await request<ContentItem[]>('/content/active');
  return items.map(item => ({ ...item, dataUrl: normalizeMediaUrl(item.dataUrl) ?? '' }));
}

export async function uploadMediaAsync(file: File): Promise<string> {
  const response = await fetch(`${getApiBase()}/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
      'X-File-Name': encodeURIComponent(file.name),
    },
    body: file,
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const result = await response.json() as { mediaUrl: string };
  return normalizeMediaUrl(result.mediaUrl) ?? '';
}

export async function addContentItemAsync(item: Omit<ContentItem, 'id' | 'createdAt' | 'order'>): Promise<ContentItem> {
  const created = await request<ContentItem>('/content', { method: 'POST', body: JSON.stringify(item) });
  return { ...created, dataUrl: normalizeMediaUrl(created.dataUrl) ?? '' };
}

export async function removeContentItemAsync(id: string): Promise<void> {
  await request<void>(`/content/${id}`, { method: 'DELETE' });
}

export async function updateContentItemAsync(id: string, updates: Partial<ContentItem>): Promise<void> {
  await request<void>(`/content/${id}`, { method: 'PATCH', body: JSON.stringify(updates) });
}

export async function getDefaultImageAsync(): Promise<string | null> {
  const result = await request<{ dataUrl: string | null }>('/default-image');
  return normalizeMediaUrl(result.dataUrl);
}

export async function setDefaultImageAsync(mediaUrl: string): Promise<void> {
  await request('/default-image', { method: 'PUT', body: JSON.stringify({ mediaUrl }) });
}

export async function removeDefaultImageAsync(): Promise<void> {
  await request('/default-image', { method: 'DELETE' });
}
