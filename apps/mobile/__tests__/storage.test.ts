const mockGetItem = jest.fn();
const mockSetItem = jest.fn();
const mockRemoveItem = jest.fn();

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: (...args: unknown[]) => mockGetItem(...args),
  setItem: (...args: unknown[]) => mockSetItem(...args),
  removeItem: (...args: unknown[]) => mockRemoveItem(...args),
}));

import {storage, cached, cachedFirst} from '../src/lib/storage';

describe('storage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('prefixes keys and JSON-encodes values on set', async () => {
    mockSetItem.mockResolvedValueOnce(undefined);
    await storage.set('session', {token: 'abc'});
    expect(mockSetItem).toHaveBeenCalledWith(
      '@tester-mobile:session',
      JSON.stringify({token: 'abc'}),
    );
  });

  it('returns null when nothing is stored', async () => {
    mockGetItem.mockResolvedValueOnce(null);
    await expect(storage.get('missing')).resolves.toBeNull();
  });

  it('returns null instead of throwing when stored JSON is corrupt', async () => {
    mockGetItem.mockResolvedValueOnce('{not-json');
    await expect(storage.get('broken')).resolves.toBeNull();
  });

  it('prefixes keys on remove', async () => {
    mockRemoveItem.mockResolvedValueOnce(undefined);
    await storage.remove('session');
    expect(mockRemoveItem).toHaveBeenCalledWith('@tester-mobile:session');
  });
});

describe('cached', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetches fresh data and caches it, marking the result as not stale', async () => {
    mockSetItem.mockResolvedValueOnce(undefined);
    const request = jest.fn().mockResolvedValueOnce({items: [1, 2, 3]});

    const result = await cached('courses', request);

    expect(result).toEqual({data: {items: [1, 2, 3]}, stale: false});
    expect(mockSetItem).toHaveBeenCalledWith(
      '@tester-mobile:cache:courses',
      expect.stringContaining('"items":[1,2,3]'),
    );
  });

  it('falls back to a cached snapshot and marks it stale when the request fails', async () => {
    const snapshot = {data: {items: ['cached']}, savedAt: 1000};
    mockGetItem.mockResolvedValueOnce(JSON.stringify(snapshot));
    const request = jest.fn().mockRejectedValueOnce(new Error('offline'));

    const result = await cached('courses', request);

    expect(result).toEqual({data: {items: ['cached']}, stale: true});
  });

  it('rethrows the original error when the request fails and there is no cached snapshot', async () => {
    mockGetItem.mockResolvedValueOnce(null);
    const error = new Error('offline, no cache');
    const request = jest.fn().mockRejectedValueOnce(error);

    await expect(cached('courses', request)).rejects.toBe(error);
  });

  describe('cachedFirst', () => {
    it('returns the cached copy immediately without waiting for the request', async () => {
      mockGetItem.mockResolvedValueOnce(
        JSON.stringify({data: {items: ['cached']}, savedAt: 1000}),
      );
      // A request that never settles: if cachedFirst awaited it, this test would time out.
      const request = jest.fn(() => new Promise<never>(() => {}));

      const result = await cachedFirst('courses', request, jest.fn());

      expect(result).toEqual({data: {items: ['cached']}, fromCache: true});
    });

    it('waits for the network when nothing is cached', async () => {
      mockGetItem.mockResolvedValueOnce(null);
      const request = jest.fn().mockResolvedValueOnce({items: ['fresh']});

      const result = await cachedFirst('courses', request, jest.fn());

      expect(result).toEqual({data: {items: ['fresh']}, fromCache: false});
    });

    it('calls onFresh when the refreshed payload differs from the cache', async () => {
      mockGetItem.mockResolvedValueOnce(
        JSON.stringify({data: {items: ['old']}, savedAt: 1000}),
      );
      const request = jest.fn().mockResolvedValueOnce({items: ['new']});
      const onFresh = jest.fn();

      await cachedFirst('courses', request, onFresh);
      await new Promise<void>((resolve) => setImmediate(() => resolve()));

      expect(onFresh).toHaveBeenCalledWith({items: ['new']});
    });

    it('does not call onFresh when the payload is unchanged', async () => {
      mockGetItem.mockResolvedValueOnce(
        JSON.stringify({data: {items: ['same']}, savedAt: 1000}),
      );
      const request = jest.fn().mockResolvedValueOnce({items: ['same']});
      const onFresh = jest.fn();

      await cachedFirst('courses', request, onFresh);
      await new Promise<void>((resolve) => setImmediate(() => resolve()));

      expect(onFresh).not.toHaveBeenCalled();
    });

    it('keeps showing the cache when the refresh fails', async () => {
      mockGetItem.mockResolvedValueOnce(
        JSON.stringify({data: {items: ['cached']}, savedAt: 1000}),
      );
      const request = jest.fn().mockRejectedValueOnce(new Error('offline'));
      const onFresh = jest.fn();

      const result = await cachedFirst('courses', request, onFresh);
      await new Promise<void>((resolve) => setImmediate(() => resolve()));

      expect(result.data).toEqual({items: ['cached']});
      expect(onFresh).not.toHaveBeenCalled();
    });
  });
});
