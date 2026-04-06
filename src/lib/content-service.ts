import { ContentItem } from './content-store';

const BACKEND_UNAVAILABLE_MESSAGE = 'Backend strežnik ni dosegljiv (preveri, da je zagnan in da je port 8787 odprt/forwardan).';
const CONTROL_PORT = '8787';

function getCodespacesApiBase(currentUrl: URL): string | null {
  if (!currentUrl.hostname.endsWith('.app.github.dev')) return null;
  const host = currentUrl.hostname.replace(/-\d+\./, `-${CONTROL_PORT}.`);
  return `${currentUrl.protocol}//${host}/api`;
}

function getApiBase() {
  const currentUrl = new URL(window.location.href);
  const fromQuery = currentUrl.searchParams.get('apiBase');
  if (fromQuery) return fromQuery;
  if (import.meta.env.VITE_API_BASE) return import.meta.env.VITE_API_BASE;

  const codespacesApiBase = getCodespacesApiBase(currentUrl);
  if (codespacesApiBase) return codespacesApiBase;

  const isLocalHost = currentUrl.hostname === 'localhost' || currentUrl.hostname === '127.0.0.1';
  const protocol = isLocalHost ? 'http:' : currentUrl.protocol;
  return `${protocol}//${currentUrl.hostname}:${CONTROL_PORT}/api`;
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
  let response: Response;
  try {
    response = await fetch(`${getApiBase()}${path}`, {
      headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
      ...init,
    });
  } catch {
    throw new Error(BACKEND_UNAVAILABLE_MESSAGE);
  }
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
  let response: Response;
  try {
    response = await fetch(`${getApiBase()}/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': file.type || 'application/octet-stream',
        'X-File-Name': encodeURIComponent(file.name),
      },
      body: file,
    });
  } catch {
    throw new Error(BACKEND_UNAVAILABLE_MESSAGE);
  }
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const result = await response.json() as { mediaUrl: string };
  return normalizeMediaUrl(result.mediaUrl) ?? '';
}

export function isBackendUnavailableError(error: unknown): boolean {
  return error instanceof Error && error.message === BACKEND_UNAVAILABLE_MESSAGE;
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
