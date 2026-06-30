import { create } from 'zustand';
import { apiFetchTests, apiCreateTest, apiUpdateTest, apiDeleteTest, type Test, type CreateTestData } from '../api/tests';

interface TestState {
  tests: Test[];
  fetchTests: (folderId: string) => Promise<void>;
  createTest: (data: CreateTestData) => Promise<Test>;
  updateTest: (id: string, data: Partial<Omit<CreateTestData, 'folderId'>>) => Promise<void>;
  deleteTest: (id: string) => Promise<void>;
}

export const useTestStore = create<TestState>((set, get) => ({
  tests: [],
  fetchTests: async (folderId) => {
    const tests = await apiFetchTests(folderId);
    set({ tests });
  },
  createTest: async (data) => {
    const test = await apiCreateTest(data);
    set({ tests: [...get().tests, test] });
    return test;
  },
  updateTest: async (id, data) => {
    const updated = await apiUpdateTest(id, data);
    set({ tests: get().tests.map((t) => (t.id === id ? updated : t)) });
  },
  deleteTest: async (id) => {
    await apiDeleteTest(id);
    set({ tests: get().tests.filter((t) => t.id !== id) });
  },
}));
