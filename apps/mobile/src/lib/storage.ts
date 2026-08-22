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
 *
 * `onSynced` fires once the background request settles successfully, whether or not the
 * payload changed. A "stale" banner driven off `fromCache` alone stuck around forever on an
 * unchanged response -- the refresh had genuinely succeeded, there was just nothing new to
 * show for it -- so callers that need to know "are we caught up with the server" (as opposed
 * to "did the data change") should clear their stale flag here instead of inside `onFresh`.
 */
export async function cachedFirst<T>(
  key: string,
  request: () => Promise<T>,
  onFresh: (data: T) => void,
  onSynced?: () => void,
): Promise<{data: T | null; fromCache: boolean}> {
  const snapshot = await storage.get<{data: T; savedAt: number}>(`cache:${key}`);

  const refresh = request()
    .then(async (fresh) => {
      await storage.set(`cache:${key}`, {data: fresh, savedAt: Date.now()});
      if (JSON.stringify(fresh) !== JSON.stringify(snapshot?.data)) onFresh(fresh);
      onSynced?.();
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
