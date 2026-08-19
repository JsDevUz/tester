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
    if (err.response?.status === 401) {
      useAuthStore.getState().logout();
      window.location.href = "/login";
    }
    return Promise.reject(err);
  },
);

export default client;
