jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

jest.mock('../src/lib/practiceMessengerSocket', () => ({
  closePracticeMessengerSocket: jest.fn(),
}));

import {api} from '../src/lib/api';
import {storage} from '../src/lib/storage';
import {useAuthStore} from '../src/store/authStore';
import {closePracticeMessengerSocket} from '../src/lib/practiceMessengerSocket';
import type {User} from '../src/types/api';

const studentAdmin: User = {id: '1', role: 'student', name: 'Ali'};
const teacherAdmin: User = {id: '2', role: 'teacher', name: 'Vali'};

describe('authStore login/loginCode', () => {
  beforeEach(() => {
    useAuthStore.setState({token: null, user: null, hydrated: false});
    jest.restoreAllMocks();
  });

  it('logs a student in and persists the session', async () => {
    jest.spyOn(api, 'post').mockResolvedValueOnce({
      data: {access_token: 'tok-1', admin: studentAdmin},
    });
    const setSpy = jest.spyOn(storage, 'set').mockResolvedValueOnce(undefined);

    await useAuthStore.getState().login('+998901234567', 'secret');

    expect(useAuthStore.getState().token).toBe('tok-1');
    expect(useAuthStore.getState().user).toEqual(studentAdmin);
    expect(setSpy).toHaveBeenCalledWith('session', {
      token: 'tok-1',
      user: studentAdmin,
    });
  });

  it('rejects login for a non-student account and does not persist a session', async () => {
    jest.spyOn(api, 'post').mockResolvedValueOnce({
      data: {access_token: 'tok-2', admin: teacherAdmin},
    });
    const setSpy = jest.spyOn(storage, 'set');

    await expect(
      useAuthStore.getState().login('+998901234567', 'secret'),
    ).rejects.toThrow("Bu ilova faqat o'quvchilar uchun");

    expect(useAuthStore.getState().token).toBeNull();
    expect(setSpy).not.toHaveBeenCalled();
  });

  it('propagates login API errors without mutating state', async () => {
    const apiError = new Error('Invalid credentials');
    jest.spyOn(api, 'post').mockRejectedValueOnce(apiError);

    await expect(
      useAuthStore.getState().login('+998901234567', 'wrong'),
    ).rejects.toBe(apiError);

    expect(useAuthStore.getState().token).toBeNull();
  });

  it('logs a student in via SMS/telegram code', async () => {
    jest.spyOn(api, 'post').mockResolvedValueOnce({
      data: {access_token: 'tok-3', admin: studentAdmin},
    });
    jest.spyOn(storage, 'set').mockResolvedValueOnce(undefined);

    await useAuthStore.getState().loginCode('123456');

    expect(useAuthStore.getState().token).toBe('tok-3');
    expect(useAuthStore.getState().user).toEqual(studentAdmin);
  });

  it('rejects a non-student account when logging in via code', async () => {
    jest.spyOn(api, 'post').mockResolvedValueOnce({
      data: {access_token: 'tok-4', admin: teacherAdmin},
    });

    await expect(useAuthStore.getState().loginCode('123456')).rejects.toThrow(
      "Bu ilova faqat o'quvchilar uchun",
    );
    expect(useAuthStore.getState().token).toBeNull();
  });
});

describe('authStore logout/setUser', () => {
  beforeEach(() => {
    useAuthStore.setState({
      token: 'tok-existing',
      user: studentAdmin,
      hydrated: true,
    });
    jest.restoreAllMocks();
  });

  it('clears the session, storage, and closes the messenger socket on logout', async () => {
    const removeSpy = jest.spyOn(storage, 'remove').mockResolvedValueOnce(undefined);

    await useAuthStore.getState().logout();

    expect(closePracticeMessengerSocket).toHaveBeenCalledTimes(1);
    expect(removeSpy).toHaveBeenCalledWith('session');
    expect(useAuthStore.getState().token).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('updates the user and re-persists the session while keeping the current token', async () => {
    const setSpy = jest.spyOn(storage, 'set').mockResolvedValueOnce(undefined);
    const updated: User = {...studentAdmin, name: 'Ali (updated)'};

    await useAuthStore.getState().setUser(updated);

    expect(useAuthStore.getState().user).toEqual(updated);
    expect(useAuthStore.getState().token).toBe('tok-existing');
    expect(setSpy).toHaveBeenCalledWith('session', {
      token: 'tok-existing',
      user: updated,
    });
  });
});
