import AsyncStorage from '@react-native-async-storage/async-storage';
const prefix='@tester-mobile:';
export const storage={
  get:async<T>(key:string):Promise<T|null>=>{const raw=await AsyncStorage.getItem(prefix+key);if(!raw)return null;try{return JSON.parse(raw) as T;}catch{return null;}},
  set:(key:string,value:unknown)=>AsyncStorage.setItem(prefix+key,JSON.stringify(value)),
  remove:(key:string)=>AsyncStorage.removeItem(prefix+key),
};

/**
 * Fetches `request`, falling back to the last saved copy when it fails.
 *
 * Note this always waits for the network: every screen using it shows a spinner for a full
 * round trip even when it has perfectly good data on disk. `cachedFirst` is the one to reach
 * for when a screen can render immediately and refresh underneath.
 */
export async function cached<T>(key:string,request:()=>Promise<T>):Promise<{data:T;stale:boolean}>{
  try{const data=await request();await storage.set(`cache:${key}`,{data,savedAt:Date.now()});return{data,stale:false};}
  catch(error){const snapshot=await storage.get<{data:T;savedAt:number}>(`cache:${key}`);if(snapshot)return{data:snapshot.data,stale:true};throw error;}
}

/**
 * Cache-first read: hands back whatever is on disk straight away, then refreshes from the
 * network and calls `onFresh` if the result differs.
 *
 * This is what makes navigation feel instant. Waiting for a round trip before painting
 * anything is why every tap took a couple of seconds -- the data was almost always already
 * there, just unused until the request came back.
 *
 * `onFresh` fires only when the payload actually changed, so an unchanged response costs no
 * re-render. Network failures are swallowed: the screen keeps the cached copy it is already
 * showing.
 */
export async function cachedFirst<T>(
  key: string,
  request: () => Promise<T>,
  onFresh: (data: T) => void,
): Promise<{data: T | null; fromCache: boolean}> {
  const snapshot = await storage.get<{data: T; savedAt: number}>(`cache:${key}`);

  const refresh = request()
    .then(async (fresh) => {
      await storage.set(`cache:${key}`, {data: fresh, savedAt: Date.now()});
      if (JSON.stringify(fresh) !== JSON.stringify(snapshot?.data)) onFresh(fresh);
      return fresh;
    })
    .catch(() => null);

  if (snapshot) {
    // Don't await the refresh -- returning now is the entire point.
    void refresh;
    return {data: snapshot.data, fromCache: true};
  }

  // Nothing cached, so there is no choice but to wait for the first load.
  const fresh = await refresh;
  return {data: fresh, fromCache: false};
}
