import React from 'react';
import {ActivityIndicator,Pressable,Text,View,type PressableProps}from'react-native';
import {WifiOff}from'lucide-react-native';
import {useNetwork}from'../providers/NetworkProvider';

export function Screen({children,className=''}:{children:React.ReactNode;className?:string}){return <View className={`flex-1 bg-canvas ${className}`}>{children}</View>;}
export function Header({title,subtitle}:{title:string;subtitle?:string}){return <View className="bg-white px-5 pb-4 pt-5"><Text className="text-2xl font-extrabold text-ink">{title}</Text>{subtitle?<Text className="mt-1 text-sm text-slate-400">{subtitle}</Text>:null}</View>;}
export function OfflineBanner(){const{online}=useNetwork();if(online)return null;return <View className="flex-row items-center justify-center gap-2 bg-amber-100 px-3 py-2"><WifiOff size={15} color="#92400e"/><Text className="text-xs font-semibold text-amber-800">Offline — saqlangan ma'lumotlar ko'rsatilmoqda</Text></View>;}
export function Button({title,loading,className='',disabled,...props}:PressableProps&{title:string;loading?:boolean;className?:string}){return <Pressable {...props} disabled={disabled||loading} className={`min-h-12 items-center justify-center rounded-2xl bg-brand px-5 active:opacity-80 disabled:opacity-40 ${className}`}>{loading?<ActivityIndicator color="white"/>:<Text className="font-bold text-white">{title}</Text>}</Pressable>;}
export function Empty({text}:{text:string}){return <View className="flex-1 items-center justify-center px-8 py-16"><Text className="text-center text-sm text-slate-400">{text}</Text></View>;}
export function Loading(){return <View className="flex-1 items-center justify-center py-20"><ActivityIndicator color="#6366f1"/></View>;}
export function StaleNote({stale}:{stale:boolean}){return stale?<Text className="px-5 py-2 text-xs text-amber-700">Oxirgi online holat ko'rsatilmoqda</Text>:null;}
