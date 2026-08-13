jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

jest.mock('../src/lib/practiceMessengerSocket', () => ({
  closePracticeMessengerSocket: jest.fn(),
}));

import {api} from '../src/lib/api';
import {
  apiFetchStudentFolders,
  apiCreateStudentTest,
} from '../src/api/student-tests';

describe('student-tests API client', () => {
  afterEach(() => jest.restoreAllMocks());

  it('fetches student folders from /me/test-folders', async () => {
    jest.spyOn(api, 'get').mockResolvedValueOnce({
      data: [{id: 'f1', adminId: 'u1', name: 'Fizika', color: '#6366f1', icon: 'folder', createdAt: '2026-01-01', testCount: 2}],
    });

    const folders = await apiFetchStudentFolders();

    expect(api.get).toHaveBeenCalledWith('/me/test-folders');
    expect(folders).toHaveLength(1);
    expect(folders[0].name).toBe('Fizika');
  });

  it('posts to /me/tests without requireAuth/onceOnly/deadline fields', async () => {
    jest.spyOn(api, 'post').mockResolvedValueOnce({data: {id: 't1'}});

    await apiCreateStudentTest({folderId: 'f1', name: 'Mening testim'});

    expect(api.post).toHaveBeenCalledWith('/me/tests', {folderId: 'f1', name: 'Mening testim'});
  });
});
