import { ContentItem } from './content-store';
import { getRuntimeConfig } from './runtime-config';

const BACKEND_UNAVAILABLE_MESSAGE = 'Backend strežnik ni dosegljiv (preveri, da je zagnan in da je port 8787 odprt/forwardan).';
const CONTROL_PORT = '8787';
const REQUEST_TIMEOUT_MS = 1500;

let resolvedApiBaseCache: string | null = null;
let resolvingApiBasePromise: Promise<string> | null = null;

export const isBackendUnavailableError = (error: unknown): boolean =>
  error instanceof Error && error.message === BACKEND_UNAVAILABLE_MESSAGE;

function getCodespacesApiBase(currentUrl: URL): string | null {
  if (!currentUrl.hostname.endsWith('.app.github.dev')) return null;
  const host = currentUrl.hostname.replace(/-\d+\./, `-${CONTROL_PORT}.`);
  return `${currentUrl.protocol}//${host}/api`;
}

function dedupe(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter(Boolean) as string[])];
}

function buildApiBaseCandidates() {
  const currentUrl = new URL(window.location.href);
  const { apiBase: runtimeApiBase } = getRuntimeConfig();
  const codespacesApiBase = getCodespacesApiBase(currentUrl);
  const isLocalHost = currentUrl.hostname === 'localhost' || currentUrl.hostname === '127.0.0.1';
  const isHttpProtocol = currentUrl.protocol === 'http:' || currentUrl.protocol === 'https:';
  const protocol = isHttpProtocol ? (isLocalHost ? 'http:' : currentUrl.protocol) : 'http:';
  const hostname = currentUrl.hostname || '127.0.0.1';

  const sameOriginApi = isHttpProtocol
    ? `${currentUrl.origin}/api`
    : null;

  return dedupe([
    runtimeApiBase,
    import.meta.env.VITE_API_BASE,
    codespacesApiBase,
    sameOriginApi,
    `${protocol}//${hostname}:${CONTROL_PORT}/api`,
    `http://127.0.0.1:${CONTROL_PORT}/api`,
    `http://localhost:${CONTROL_PORT}/api`,
  ]);
}

async function probeApiBase(apiBase: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${apiBase}/health`, { signal: controller.signal });
    if (!response.ok) return false;
    const body = await response.json().catch(() => null);
    return Boolean(body?.ok);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function probeAdminApiBaseAsync(apiBase: string): Promise<boolean> {
  return probeApiBase(apiBase.replace(/\/$/, '').replace(/\/api$/, '/api'));
}

export async function searchAdminByIpAsync(ip: string, ports: number[]): Promise<string | null> {
  const cleanIp = ip.trim();
  if (!cleanIp) return null;
  for (const port of ports) {
    const candidate = `http://${cleanIp}:${port}/api`;
    if (await probeApiBase(candidate)) return candidate;
  }
  return null;
}

async function resolveApiBase(): Promise<string> {
  if (resolvedApiBaseCache) return resolvedApiBaseCache;
  if (resolvingApiBasePromise) return resolvingApiBasePromise;

  const candidates = buildApiBaseCandidates();
  resolvingApiBasePromise = (async () => {
    for (const candidate of candidates) {
      if (await probeApiBase(candidate)) {
        resolvedApiBaseCache = candidate;
        return candidate;
      }
    }
    resolvedApiBaseCache = candidates[0] || `http://127.0.0.1:${CONTROL_PORT}/api`;
    return resolvedApiBaseCache;
  })();

  try {
    return await resolvingApiBasePromise;
  } finally {
    resolvingApiBasePromise = null;
  }
}

export async function searchAdminAppAsync(excludeApiBase?: string): Promise<string | null> {
  const normalizedExclude = excludeApiBase
    ? excludeApiBase.replace(/\/$/, '').replace(/\/api$/, '/api')
    : null;
  const candidates = buildApiBaseCandidates();
  for (const candidate of candidates) {
    if (normalizedExclude && candidate === normalizedExclude) continue;
    if (await probeApiBase(candidate)) {
      resolvedApiBaseCache = candidate;
      return candidate;
    }
  }
  return null;
}

export interface NetworkInfo {
  port: number;
  addresses: string[];
  apiPath: string;
  healthPath: string;
}

function getResolvedBackendOrigin() {
  const fallback = buildApiBaseCandidates()[0] || `http://127.0.0.1:${CONTROL_PORT}/api`;
  return new URL(resolvedApiBaseCache || fallback).origin;
}

function normalizeMediaUrl(url: string | null | undefined) {
  if (!url) return null;
  if (url.startsWith('data:')) return url;
  if (url.startsWith('http://') || url.startsWith('https://')) {
    try {
      const parsed = new URL(url);
      const backendOrigin = new URL(getResolvedBackendOrigin());
      const isLoopback = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
      const shouldRewriteLoopback = isLoopback && backendOrigin.hostname !== 'localhost' && backendOrigin.hostname !== '127.0.0.1';
      if (shouldRewriteLoopback) {
        return `${backendOrigin.origin}${parsed.pathname}${parsed.search}${parsed.hash}`;
      }
    } catch {
      return url;
    }
    return url;
  }
  if (url.startsWith('/')) return `${getResolvedBackendOrigin()}${url}`;
  return `${getResolvedBackendOrigin()}/${url}`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    const apiBase = await resolveApiBase();
    response = await fetch(`${apiBase}${path}`, {
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
  const { channelId } = getRuntimeConfig();
  const query = channelId ? `?channel=${encodeURIComponent(channelId)}` : '';
  const items = await request<ContentItem[]>(`/content/active${query}`);
  return items.map(item => ({ ...item, dataUrl: normalizeMediaUrl(item.dataUrl) ?? '' }));
}

export async function uploadMediaAsync(file: File): Promise<string> {
  let response: Response;
  try {
    const apiBase = await resolveApiBase();
    response = await fetch(`${apiBase}/upload`, {
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
  return result.mediaUrl;
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

export async function getNetworkInfoAsync(): Promise<NetworkInfo> {
  return request<NetworkInfo>('/network-info');
}
