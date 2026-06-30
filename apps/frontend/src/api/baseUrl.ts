const API_PREFIX = '/api/v1';

export function normalizeApiBaseUrl(rawBaseUrl: string | undefined) {
  const baseUrl = (rawBaseUrl ?? '').replace(/\/+$/, '');

  if (!baseUrl) return API_PREFIX;
  if (baseUrl.endsWith(API_PREFIX)) return baseUrl;
  return `${baseUrl}${API_PREFIX}`;
}

export function getApiBaseUrl() {
  return normalizeApiBaseUrl(import.meta.env.VITE_API_URL);
}
