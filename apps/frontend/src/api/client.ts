import axios from "axios";
import { useLoadingStore } from "../stores/loadingStore";
import { useAuthStore } from "../stores/authStore";
import { getApiBaseUrl } from "./baseUrl";

const client = axios.create({
  baseURL: getApiBaseUrl(),
  // Native WebViews can otherwise wait indefinitely when the connection drops.
  timeout: 15_000,
});

client.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  useLoadingStore.getState().inc();
  return config;
});

/**
 * A 401 only means "this session expired" when the API itself said so. While the backend is
 * down or redeploying, the proxy in front of it can answer with a 401 of its own (or an HTML
 * error page), and logging out on that would bounce the user to /login mid-session for
 * something that resolves on its own.
 *
 * So the session is cleared only for a 401 carrying a JSON body, which is what the API always
 * returns and an infrastructure error page never does.
 */
function isSessionRejection(err: any): boolean {
  const response = err?.response;
  if (response?.status !== 401) return false;

  const contentType = String(response.headers?.["content-type"] ?? "");
  if (contentType.includes("application/json")) return true;

  // Axios parses JSON into an object; an HTML error page stays a string.
  return typeof response.data === "object" && response.data !== null;
}

client.interceptors.response.use(
  (res) => {
    useLoadingStore.getState().dec();
    return res;
  },
  async (err) => {
    useLoadingStore.getState().dec();
    const config = err.config;
    // Auto-retry once on network drops/QUIC idle timeouts
    if (
      config &&
      !config._retry &&
      (!err.response || err.code === 'ERR_NETWORK' || err.message?.includes('timeout') || err.message?.includes('Network Error'))
    ) {
      config._retry = true;
      return client(config);
    }
    if (isSessionRejection(err)) {
      useAuthStore.getState().logout();
      window.location.href = "/login";
    }
    return Promise.reject(err);
  },
);

export default client;
