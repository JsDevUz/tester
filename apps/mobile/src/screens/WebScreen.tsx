import React,{useMemo,useState}from'react';
import {Linking,Text,View}from'react-native';
import type{NativeStackScreenProps}from'@react-navigation/native-stack';
import {WebView}from'react-native-webview';
import type{RootStackParamList}from'../navigation/types';
import{WEB_URL}from'../config/env';
import{useAuthStore}from'../store/authStore';
import{useNetwork}from'../providers/NetworkProvider';
import{Button,Loading}from'../components/Ui';

type Props=NativeStackScreenProps<RootStackParamList,'Web'>;
// The session token is handed to the page through localStorage, so the WebView must never
// wander off our own origin: lesson HTML can contain any external link, and the injection
// runs before content loads for EVERY navigation. External links open in the browser instead.
const WEB_ORIGIN=WEB_URL.replace(/\/$/,'');
const isInternalUrl=(url:string)=>url.startsWith(WEB_ORIGIN+'/')||url===WEB_ORIGIN||!/^https?:/i.test(url);
export function WebScreen({route}:Props){
  const token=useAuthStore(s=>s.token);const{online,check}=useNetwork();const[retry,setRetry]=useState(0);
  const injected=useMemo(()=>`(function(){try{if(location.origin===${JSON.stringify(WEB_ORIGIN)}){localStorage.setItem('token',${JSON.stringify(token)});document.documentElement.classList.add('mobile-native');}}catch(e){}true;})();`,[token]);
  if(route.params.onlineRequired&&!online)return <View className="flex-1 items-center justify-center bg-white px-8"><Text className="text-center text-xl font-black text-ink dark:text-dark-ink">Internet aloqasi kerak</Text><Text className="mt-2 text-center text-sm leading-5 text-slate-400">Bu real-time sahifa: jonli dars, test topshirish yoki yuborish offline ishlamaydi.</Text><Button title="Qayta tekshirish" className="mt-6" onPress={async()=>{if(await check())setRetry(x=>x+1);}}/></View>;
  return <WebView key={retry} source={{uri:WEB_URL+route.params.path}} injectedJavaScriptBeforeContentLoaded={injected} onShouldStartLoadWithRequest={req=>{if(isInternalUrl(req.url))return true;void Linking.openURL(req.url).catch(()=>{});return false;}} sharedCookiesEnabled domStorageEnabled cacheEnabled cacheMode="LOAD_CACHE_ELSE_NETWORK" allowsInlineMediaPlayback mediaPlaybackRequiresUserAction={false} javaScriptEnabled startInLoadingState renderLoading={()=><Loading/>} renderError={()=>online?<View className="flex-1 items-center justify-center px-8"><Text className="text-center text-slate-500">Sahifani ochib bo'lmadi</Text></View>:<View className="flex-1 items-center justify-center px-8"><Text className="text-center font-bold text-slate-700">Bu sahifa oldin to'liq yuklanmagan</Text><Text className="mt-2 text-center text-sm text-slate-400">Internetga ulanganda bir marta oching — keyin cache'dan ko'rinadi.</Text></View>}/>;
}
