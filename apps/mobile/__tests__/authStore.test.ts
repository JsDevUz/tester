jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

import {storage} from '../src/lib/storage';
import {useAuthStore} from '../src/store/authStore';

describe('auth hydration', () => {
  beforeEach(() => {
    useAuthStore.setState({token: null, user: null, hydrated: false});
    jest.restoreAllMocks();
  });

  it('finishes hydration when native storage is unavailable', async () => {
    jest.spyOn(storage, 'get').mockRejectedValueOnce(new Error('storage unavailable'));

    await expect(useAuthStore.getState().hydrate()).resolves.toBeUndefined();

    expect(useAuthStore.getState()).toMatchObject({
      token: null,
      user: null,
      hydrated: true,
    });
  });
});
