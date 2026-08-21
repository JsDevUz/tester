// In-memory stand-in for the native keychain so jest runs never touch the real module
// (which needs the native binary and is not covered by the RN jest preset). The methods are
// jest.fn()s -- not plain async functions -- so a test can call mockRejectedValueOnce etc.
// directly on the module a test imports, without the module-identity mismatch that
// `import * as Keychain` + jest.mock(factory) hits under this repo's Babel interop.
let stored = null;

module.exports = {
  getGenericPassword: jest.fn(async () => stored),
  setGenericPassword: jest.fn(async (username, password) => {
    stored = {username, password};
    return true;
  }),
  resetGenericPassword: jest.fn(async () => {
    stored = null;
    return true;
  }),
  ACCESSIBLE: {
    WHEN_UNLOCKED: 'WhenUnlocked',
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WhenUnlockedThisDeviceOnly',
  },
  __reset() {
    stored = null;
  },
};
