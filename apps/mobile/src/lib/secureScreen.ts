import {NativeModules, Platform} from 'react-native';

const {SecureScreen} = NativeModules as {
  SecureScreen?: {enable(): void; disable(): void};
};

export function enableSecureScreen(): void {
  if (Platform.OS === 'android') SecureScreen?.enable();
}

export function disableSecureScreen(): void {
  if (Platform.OS === 'android') SecureScreen?.disable();
}
