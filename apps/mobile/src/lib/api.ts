import axios from 'axios';
import {API_URL} from '../config/env';
import {useAuthStore} from '../store/authStore';

export const api = axios.create({baseURL: API_URL, timeout: 15000});

api.interceptors.request.use(config => {
  const token = useAuthStore.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/**
 * A 401 only means "this session is no longer valid" when the API itself said so. While the
 * backend is down or redeploying, the proxy in front of it can answer with a 401 of its own
 * (or an HTML error page), and logging the user out on that would dump them back at the
 * login screen for something that resolves on its own in a minute.
 *
 * So the session is cleared only for a 401 that carries a JSON body, which is what the API
 * always returns and an infrastructure error page never does.
 */
function isSessionRejection(error: any): boolean {
  const response = error?.response;
  if (response?.status !== 401) return false;

  const contentType = String(response.headers?.['content-type'] ?? '');
  if (contentType.includes('application/json')) return true;

  // Axios parses JSON into an object; an HTML error page stays a string.
  return typeof response.data === 'object' && response.data !== null;
}

api.interceptors.response.use(
  r => r,
  error => {
    if (isSessionRejection(error)) void useAuthStore.getState().logout();
    return Promise.reject(error);
  },
);
