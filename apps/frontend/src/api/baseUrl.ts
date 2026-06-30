const API_PREFIX = '/api/v1';

function normalizeBaseUrl(rawBaseUrl: string | undefined) {
  return (rawBaseUrl ?? '').replace(/\/+$/, '');
}

export function normalizeApiBaseUrl(rawBaseUrl: string | undefined) {
  const baseUrl = normalizeBaseUrl(rawBaseUrl);

  if (!baseUrl) return API_PREFIX;
  if (baseUrl.endsWith(API_PREFIX)) return baseUrl;
  return `${baseUrl}${API_PREFIX}`;
}

export function normalizePublicBaseUrl(rawBaseUrl: string | undefined) {
  const baseUrl = (rawBaseUrl ?? '').replace(/\/+$/, '');

  if (!baseUrl) return '';
  if (baseUrl.endsWith(API_PREFIX)) return baseUrl.slice(0, -API_PREFIX.length);
  return baseUrl;
}

export function getApiBaseUrl() {
  return normalizeApiBaseUrl(import.meta.env?.VITE_API_URL);
}

export function getPublicBaseUrl() {
  return normalizePublicBaseUrl(import.meta.env?.VITE_API_URL);
}
