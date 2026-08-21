jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

jest.mock('../src/lib/practiceMessengerSocket', () => ({
  closePracticeMessengerSocket: jest.fn(),
}));

jest.mock('../src/lib/secureToken', () => ({
  getSecureToken: jest.fn().mockResolvedValue(null),
  setSecureToken: jest.fn().mockResolvedValue(undefined),
  clearSecureToken: jest.fn().mockResolvedValue(undefined),
}));

import type {InternalAxiosRequestConfig, AxiosResponse} from 'axios';
import {api} from '../src/lib/api';
import {useAuthStore} from '../src/store/authStore';

// Axios doesn't expose a public API to invoke a registered interceptor
// directly, so tests reach into the internal `.handlers` array the same way
// axios itself does at request/response time. This is the standard pattern
// for unit-testing interceptor logic in isolation from a real HTTP call.
type Handlers<T> = {handlers: Array<{fulfilled: (v: T) => T | Promise<T>; rejected: (e: unknown) => unknown}>};
const requestHandlers = (api.interceptors.request as unknown as Handlers<InternalAxiosRequestConfig>).handlers;
const responseHandlers = (api.interceptors.response as unknown as Handlers<AxiosResponse>).handlers;

describe('api request interceptor', () => {
  beforeEach(() => {
    useAuthStore.setState({token: null, user: null, hydrated: false});
  });

  it('attaches a Bearer token to outgoing requests when one is present', async () => {
    useAuthStore.setState({token: 'abc123'});

    const config = await requestHandlers[0].fulfilled({
      headers: {},
    } as InternalAxiosRequestConfig);

    expect((config.headers as Record<string, string>).Authorization).toBe('Bearer abc123');
  });

  it('does not set an Authorization header when there is no token', async () => {
    useAuthStore.setState({token: null});

    const config = await requestHandlers[0].fulfilled({
      headers: {},
    } as InternalAxiosRequestConfig);

    expect((config.headers as Record<string, string>).Authorization).toBeUndefined();
  });
});

describe('api response interceptor', () => {
  beforeEach(() => {
    useAuthStore.setState({token: 'abc123', user: {id: '1', role: 'student', name: 'Ali'}, hydrated: true});
  });

  it('logs the user out when the API rejects the session with a JSON 401', async () => {
    const error = {
      response: {
        status: 401,
        headers: {'content-type': 'application/json'},
        data: {message: 'Unauthorized'},
      },
    };

    await expect(responseHandlers[0].rejected(error)).rejects.toBe(error);

    // logout() is async; let its promise chain flush.
    await Promise.resolve();
    await Promise.resolve();

    expect(useAuthStore.getState().token).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
  });

  // A 401 from the proxy while the backend restarts is not an expired session; logging out on
  // it would drop the user at the login screen for something that fixes itself.
  it('keeps the session for a 401 that did not come from the API', async () => {
    const error = {
      response: {
        status: 401,
        headers: {'content-type': 'text/html'},
        data: '<html>502 Bad Gateway</html>',
      },
    };

    await expect(responseHandlers[0].rejected(error)).rejects.toBe(error);
    await Promise.resolve();
    await Promise.resolve();

    expect(useAuthStore.getState().token).toBe('abc123');
  });

  it('leaves the session untouched for non-401 errors', async () => {
    const error = {response: {status: 500}};

    await expect(responseHandlers[0].rejected(error)).rejects.toBe(error);

    expect(useAuthStore.getState().token).toBe('abc123');
  });

  it('leaves the session untouched when there is no response at all (network error)', async () => {
    const error = {message: 'Network Error'};

    await expect(responseHandlers[0].rejected(error)).rejects.toBe(error);

    expect(useAuthStore.getState().token).toBe('abc123');
  });

  it('passes successful responses through unchanged', () => {
    const response = {data: {ok: true}, status: 200} as AxiosResponse;
    expect(responseHandlers[0].fulfilled(response)).toBe(response);
  });
});
