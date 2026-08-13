import axios from 'axios';
import {API_URL} from '../config/env';
import {useAuthStore} from '../store/authStore';
export const api=axios.create({baseURL:API_URL,timeout:15000});
api.interceptors.request.use(config=>{const token=useAuthStore.getState().token;if(token)config.headers.Authorization=`Bearer ${token}`;return config;});
api.interceptors.response.use(r=>r,error=>{if(error.response?.status===401)void useAuthStore.getState().logout();return Promise.reject(error);});
