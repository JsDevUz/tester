import AsyncStorage from '@react-native-async-storage/async-storage';
const prefix='@tester-mobile:';
export const storage={
  get:async<T>(key:string):Promise<T|null>=>{const raw=await AsyncStorage.getItem(prefix+key);if(!raw)return null;try{return JSON.parse(raw) as T;}catch{return null;}},
  set:(key:string,value:unknown)=>AsyncStorage.setItem(prefix+key,JSON.stringify(value)),
  remove:(key:string)=>AsyncStorage.removeItem(prefix+key),
};
export async function cached<T>(key:string,request:()=>Promise<T>):Promise<{data:T;stale:boolean}>{
  try{const data=await request();await storage.set(`cache:${key}`,{data,savedAt:Date.now()});return{data,stale:false};}
  catch(error){const snapshot=await storage.get<{data:T;savedAt:number}>(`cache:${key}`);if(snapshot)return{data:snapshot.data,stale:true};throw error;}
}
