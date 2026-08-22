import './src/styles/global.css';
import React, {useEffect} from 'react';
import {ActivityIndicator, StatusBar, View} from 'react-native';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {useColorScheme} from 'nativewind';
import {NavigationContainer} from '@react-navigation/native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {RootNavigator} from './src/navigation/RootNavigator';
import {getLinking} from './src/navigation/linking';
import {useAuthStore} from './src/store/authStore';
import {useThemeStore} from './src/store/themeStore';
import {NetworkProvider} from './src/providers/NetworkProvider';
import {LiveNotificationsProvider} from './src/providers/LiveNotificationsProvider';
import {AppUpdatePrompt} from './src/providers/AppUpdatePrompt';

export default function App() {
  const hydrate = useAuthStore(s => s.hydrate);
  const hydrated = useAuthStore(s => s.hydrated);
  const token = useAuthStore(s => s.token);
  const hydrateTheme = useThemeStore(s => s.hydrate);
  const themeHydrated = useThemeStore(s => s.hydrated);
  const {colorScheme} = useColorScheme();
  const isDark = colorScheme === 'dark';

  useEffect(() => {
    void hydrate();
    void hydrateTheme();
  }, [hydrate, hydrateTheme]);

  useEffect(() => {
    StatusBar.setBarStyle(isDark ? 'light-content' : 'dark-content', true);
  }, [isDark]);

  if (!hydrated || !themeHydrated) {
    return (
      <View className="flex-1 items-center justify-center bg-white dark:bg-dark-canvas">
        <ActivityIndicator color="#6366f1" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{flex: 1}}>
      <SafeAreaProvider>
        <NetworkProvider>
          <LiveNotificationsProvider>
            <StatusBar
              barStyle={isDark ? 'light-content' : 'dark-content'}
              backgroundColor={isDark ? '#1b1c22' : '#ffffff'}
              translucent={false}
            />
            <NavigationContainer linking={getLinking(!!token)}>
              <RootNavigator />
            </NavigationContainer>
            <AppUpdatePrompt />
          </LiveNotificationsProvider>
        </NetworkProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
