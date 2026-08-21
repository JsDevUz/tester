import React, {createContext, useCallback, useContext, useEffect, useMemo, useRef, useState} from 'react';
import NetInfo from '@react-native-community/netinfo';
import {API_URL} from '../config/env';

type NetworkState = {online: boolean; checking: boolean; check: () => Promise<boolean>};
const Context = createContext<NetworkState>({online: true, checking: false, check: async () => true});

export function NetworkProvider({children}: {children: React.ReactNode}) {
  const [online, setOnline] = useState(true);
  const [checking, setChecking] = useState(false);
  // NetInfo reports device-level connectivity (radio up, DNS resolves) the instant it
  // changes -- no polling. That is not quite the same question as "can we reach our own
  // API" (wifi with no internet, a captive portal), which is what `check()` below still
  // confirms with a real request. The subscription is what lets a video mid-playback
  // notice the moment a flight-mode toggle flips back, instead of waiting on the old
  // 30-second timer.
  const onlineRef = useRef(online);
  onlineRef.current = online;

  const check = useCallback(async () => {
    setChecking(true);
    try {
      await fetch(API_URL.replace('/api/v1', ''), {method: 'HEAD'});
      setOnline(true);
      return true;
    } catch {
      setOnline(false);
      return false;
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      const reachable = state.isConnected && state.isInternetReachable !== false;
      if (reachable === onlineRef.current) return;
      if (reachable) {
        // NetInfo's own "internet reachable" probe already did the real-world check;
        // trust it directly rather than firing a second HEAD request on our own API.
        setOnline(true);
      } else {
        setOnline(false);
      }
    });
    // NetInfo does not always fire an initial event before the first render, so seed the
    // real value once instead of assuming online.
    void check();
    return unsubscribe;
  }, [check]);

  const value = useMemo(() => ({online, checking, check}), [online, checking, check]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export const useNetwork = () => useContext(Context);
