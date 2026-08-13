import React, {useEffect, useState} from 'react';
import {Platform, Pressable, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useColorScheme} from 'nativewind';
import {Download, RefreshCw} from 'lucide-react-native';
// Runtime'da haqiqiy nomlar IAUInstallStatus/IAUUpdateKind — appUpdate.ts
// dagi izohga qarang.
import SpInAppUpdates, {IAUInstallStatus, IAUUpdateKind} from 'sp-react-native-in-app-updates';
import {APP_UPDATE_TYPE} from '../config/appUpdate';

// MUHIM: SpInAppUpdates konstruktori ichida `new NativeEventEmitter(nativeModule)`
// chaqiradi — agar native modul biror sabab bilan release build'da
// registratsiya qilinmagan bo'lsa (autolinking/Play Core muammosi), bu
// DARHOL (try/catch'siz) "Invariant Violation" bilan butun ilovani modul
// import qilingan zahoti (App.tsx yuklanganda) crash qiladi. Shu sabab
// instansiya module-level'da emas, balki useEffect ICHIDA, try/catch bilan
// yaratiladi — eng yomon holatda funksiya sokin ishlamay qoladi, ilova esa
// ochilaveradi.
let inAppUpdatesInstance: SpInAppUpdates | null | undefined;
function getInAppUpdates(): SpInAppUpdates | null {
  if (inAppUpdatesInstance !== undefined) return inAppUpdatesInstance;
  try {
    inAppUpdatesInstance = new SpInAppUpdates(false);
  } catch {
    inAppUpdatesInstance = null;
  }
  return inAppUpdatesInstance;
}

// Google Play In-App Update API — eski versiyani o'rnatgan foydalanuvchilarga
// yangilanish borligini bildiradi. FLEXIBLE rejimda (APP_UPDATE_TYPE) fon
// rejimida yuklab olinadi, ilova ishlashda davom etadi; yuklab bo'lgach shu
// komponent "Qayta ishga tushirish" banerini ko'rsatadi. IMMEDIATE rejimda
// esa Google'ning o'z to'liq ekranli dialogi ko'rsatiladi, bu holda bu
// komponent hech narsa chizmaydi (native UI o'zi bloklaydi).
export function AppUpdatePrompt() {
  const [downloaded, setDownloaded] = useState(false);
  const insets = useSafeAreaInsets();
  const {colorScheme} = useColorScheme();
  const isDark = colorScheme === 'dark';

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const inAppUpdates = getInAppUpdates();
    if (!inAppUpdates) return;

    inAppUpdates
      .checkNeedsUpdate()
      .then(result => {
        if (!result.shouldUpdate) return;
        return inAppUpdates.startUpdate({updateType: APP_UPDATE_TYPE});
      })
      .catch(() => undefined);

    const onStatusUpdate = (event: {status: IAUInstallStatus}) => {
      if (event.status === IAUInstallStatus.DOWNLOADED) setDownloaded(true);
    };
    inAppUpdates.addStatusUpdateListener(onStatusUpdate);
    return () => inAppUpdates.removeStatusUpdateListener(onStatusUpdate);
  }, []);

  if (Platform.OS !== 'android' || APP_UPDATE_TYPE !== IAUUpdateKind.FLEXIBLE || !downloaded) {
    return null;
  }

  return (
    <Pressable
      onPress={() => getInAppUpdates()?.installUpdate()}
      style={{
        position: 'absolute',
        left: 12,
        right: 12,
        bottom: insets.bottom + 76,
        zIndex: 70,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        borderRadius: 16,
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: isDark ? '#242428' : '#111827',
        shadowColor: '#000',
        shadowOffset: {width: 0, height: 4},
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 8,
      }}>
      <Download size={18} color="white" />
      <Text style={{flex: 1, color: 'white', fontSize: 13, fontWeight: '600'}}>
        Yangi versiya yuklab olindi
      </Text>
      <View style={{flexDirection: 'row', alignItems: 'center', gap: 4}}>
        <RefreshCw size={14} color="#a5b4fc" />
        <Text style={{color: '#a5b4fc', fontSize: 13, fontWeight: '700'}}>Qayta ishga tushirish</Text>
      </View>
    </Pressable>
  );
}
