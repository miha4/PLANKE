export interface RuntimeConfig {
  apiBase: string | null;
  deviceId: string | null;
  channelId: 'A' | 'B' | 'C' | null;
}

function normalizeApiBase(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.replace(/\/$/, '').replace(/\/api$/, '/api');
}

function getHashQueryParams(location: Location): URLSearchParams {
  const hash = location.hash || '';
  const qIndex = hash.indexOf('?');
  if (qIndex < 0) return new URLSearchParams();
  return new URLSearchParams(hash.slice(qIndex + 1));
}

export function getRuntimeConfig(location: Location = window.location): RuntimeConfig {
  const searchParams = new URLSearchParams(location.search);
  const hashParams = getHashQueryParams(location);

  const apiBase = normalizeApiBase(searchParams.get('apiBase') || hashParams.get('apiBase'));
  const deviceId = searchParams.get('deviceId') || hashParams.get('deviceId');
  const channelRaw = searchParams.get('channel') || hashParams.get('channel');
  const channelId = channelRaw === 'A' || channelRaw === 'B' || channelRaw === 'C' ? channelRaw : null;

  return {
    apiBase,
    deviceId: deviceId?.trim() ? deviceId : null,
    channelId,
  };
}
