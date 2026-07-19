import {create} from 'zustand';
import {api} from '../lib/api';
import {storage} from '../lib/storage';
import type {User} from '../types/api';
type AuthState={token:string|null;user:User|null;hydrated:boolean;hydrate:()=>Promise<void>;login:(phone:string,password:string)=>Promise<void>;loginCode:(code:string)=>Promise<void>;logout:()=>Promise<void>};
export const useAuthStore=create<AuthState>(set=>({
  token:null,user:null,hydrated:false,
  hydrate:async()=>{const session=await storage.get<{token:string;user:User}>('session');set({token:session?.token??null,user:session?.user??null,hydrated:true});if(session?.token)api.get('/auth/me').then(r=>{const next={token:session.token,user:r.data as User};set(next);void storage.set('session',next);}).catch(()=>undefined);},
  login:async(phone,password)=>{const{data}=await api.post('/auth/login',{phone,password});if(data.admin.role!=='student')throw new Error("Bu ilova faqat o'quvchilar uchun");const session={token:data.access_token,user:data.admin};await storage.set('session',session);set(session);},
  loginCode:async code=>{const{data}=await api.post('/auth/telegram/verify',{code});if(data.admin.role!=='student')throw new Error("Bu ilova faqat o'quvchilar uchun");const session={token:data.access_token,user:data.admin};await storage.set('session',session);set(session);},
  logout:async()=>{await storage.remove('session');set({token:null,user:null});},
}));
