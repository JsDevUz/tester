import React,{createContext,useCallback,useContext,useEffect,useMemo,useState}from'react';
import {AppState}from'react-native';
import {API_URL}from'../config/env';
type NetworkState={online:boolean;checking:boolean;check:()=>Promise<boolean>};
const Context=createContext<NetworkState>({online:true,checking:false,check:async()=>true});
export function NetworkProvider({children}:{children:React.ReactNode}){const[online,setOnline]=useState(true);const[checking,setChecking]=useState(false);const check=useCallback(async()=>{setChecking(true);try{await fetch(API_URL.replace('/api/v1',''),{method:'HEAD'});setOnline(true);return true;}catch{setOnline(false);return false;}finally{setChecking(false);}},[]);useEffect(()=>{void check();const timer=setInterval(()=>void check(),30000);const sub=AppState.addEventListener('change',s=>{if(s==='active')void check();});return()=>{clearInterval(timer);sub.remove();};},[check]);const value=useMemo(()=>({online,checking,check}),[online,checking,check]);return <Context.Provider value={value}>{children}</Context.Provider>;}
export const useNetwork=()=>useContext(Context);
