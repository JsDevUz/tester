jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

import {storage} from '../src/lib/storage';
import {clearSecureToken, getSecureToken, setSecureToken} from '../src/lib/secureToken';

// require(), not `import * as Keychain`: Babel's ESM interop for a wildcard import of a
// CommonJS module produced a different object than the one secureToken.ts saw internally,
// which left mockRejectedValueOnce patching a copy nothing actually called. The manual mock
// at __mocks__/react-native-keychain.js already exposes jest.fn()s, so requiring it directly
// gets the exact instance in use.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Keychain = require('react-native-keychain');

describe('secureToken', () => {
  beforeEach(() => {
    Keychain.__reset();
    Keychain.getGenericPassword.mockClear();
    Keychain.setGenericPassword.mockClear();
    Keychain.resetGenericPassword.mockClear();
    jest.restoreAllMocks();
  });

  it('round-trips a token through the keychain', async () => {
    await setSecureToken('tok-1');
    await expect(getSecureToken()).resolves.toBe('tok-1');
  });

  it('returns null when nothing has been stored', async () => {
    await expect(getSecureToken()).resolves.toBeNull();
  });

  it('clears the token so a later read returns null', async () => {
    await setSecureToken('tok-1');
    await clearSecureToken();
    await expect(getSecureToken()).resolves.toBeNull();
  });

  it('falls back to AsyncStorage when the keychain write throws', async () => {
    Keychain.setGenericPassword.mockRejectedValueOnce(new Error('no keychain'));
    const storageSetSpy = jest.spyOn(storage, 'set');

    await setSecureToken('tok-fallback');

    expect(storageSetSpy).toHaveBeenCalledWith('session-token-fallback', 'tok-fallback');
  });

  it('falls back to the AsyncStorage copy when the keychain read throws', async () => {
    Keychain.getGenericPassword.mockRejectedValueOnce(new Error('no keychain'));
    jest.spyOn(storage, 'get').mockResolvedValueOnce('tok-from-fallback');

    await expect(getSecureToken()).resolves.toBe('tok-from-fallback');
  });

  it('clears the AsyncStorage fallback copy even if the keychain reset throws', async () => {
    Keychain.resetGenericPassword.mockRejectedValueOnce(new Error('no keychain'));
    const storageRemoveSpy = jest.spyOn(storage, 'remove');

    await clearSecureToken();

    expect(storageRemoveSpy).toHaveBeenCalledWith('session-token-fallback');
  });
});
