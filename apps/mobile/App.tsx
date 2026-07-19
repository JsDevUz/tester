import './src/styles/global.css';
import React, {useEffect} from 'react';
import {ActivityIndicator, StatusBar, View} from 'react-native';
import {NavigationContainer} from '@react-navigation/native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {RootNavigator} from './src/navigation/RootNavigator';
import {useAuthStore} from './src/store/authStore';
import {NetworkProvider} from './src/providers/NetworkProvider';

export default function App() {
  const hydrate = useAuthStore(s => s.hydrate);
  const hydrated = useAuthStore(s => s.hydrated);
  useEffect(() => { void hydrate(); }, [hydrate]);
  if (!hydrated) return <View className="flex-1 items-center justify-center bg-white"><ActivityIndicator color="#6366f1" /></View>;
  return (
    <SafeAreaProvider>
      <NetworkProvider>
        <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
        <NavigationContainer><RootNavigator /></NavigationContainer>
      </NetworkProvider>
    </SafeAreaProvider>
  );
}
