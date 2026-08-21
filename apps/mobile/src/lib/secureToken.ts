import * as Keychain from 'react-native-keychain';
import { storage } from './storage';

/**
 * Session-token storage backed by the OS keychain / keystore, which neither other apps nor
 * an unencrypted device backup can read -- unlike AsyncStorage's plaintext store.
 *
 * The keychain can be unavailable in practice (device in restricted mode, a broken
 * enterprise profile, or the native module absent from a test runtime); every call then
 * falls back to AsyncStorage so login still persists instead of trapping the user at the
 * login screen.
 */
const SERVICE = 'uz.jamm.mobile.session';
const FALLBACK_KEY = 'session-token-fallback';

export async function getSecureToken(): Promise<string | null> {
  try {
    const creds = await Keychain.getGenericPassword({service: SERVICE});
    if (creds && typeof creds.password === 'string') {
      return creds.password;
    }
  } catch {
    // fall through to the AsyncStorage copy
  }
  return storage.get<string>(FALLBACK_KEY);
}

export async function setSecureToken(token: string): Promise<void> {
  try {
    await Keychain.setGenericPassword('session', token, {
      service: SERVICE,
      accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    return;
  } catch {
    // fall through to the AsyncStorage copy
  }
  await storage.set(FALLBACK_KEY, token);
}

export async function clearSecureToken(): Promise<void> {
  try {
    await Keychain.resetGenericPassword({service: SERVICE});
  } catch {
    // the AsyncStorage copy is cleared either way
  }
  await storage.remove(FALLBACK_KEY);
}
