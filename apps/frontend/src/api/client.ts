import axios from 'axios';
import { useLoadingStore } from '../store/loadingStore';
import { getApiBaseUrl } from './baseUrl';

const client = axios.create({
  baseURL: getApiBaseUrl(),
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
