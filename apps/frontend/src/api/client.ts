import axios from 'axios';
import { useLoadingStore } from '../store/loadingStore';

const client = axios.create({
  baseURL: `${import.meta.env.VITE_API_URL}/api/v1`,
});

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  useLoadingStore.getState().inc();
  return config;
});

client.interceptors.response.use(
  (res) => { useLoadingStore.getState().dec(); return res; },
  (err) => {
    useLoadingStore.getState().dec();
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  },
);

export default client;
