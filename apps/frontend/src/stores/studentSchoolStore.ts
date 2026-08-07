import { create } from 'zustand';
import { apiGetMySchools, type ApiMySchool } from '../api/groups';

interface StudentSchoolState {
  schools: ApiMySchool[];
  currentSchoolId: string | null;
  loaded: boolean;
  error: string | null;
  loadSchools: () => Promise<void>;
  selectSchool: (id: string) => void;
}

export const useStudentSchoolStore = create<StudentSchoolState>((set) => ({
  schools: [],
  currentSchoolId: null,
  loaded: false,
  error: null,

  loadSchools: async () => {
    set({ loaded: false, error: null });
    try {
      const schools = await apiGetMySchools();
      set({ schools, loaded: true });
    } catch {
      set({ error: "Maktablarni yuklab bo'lmadi. Internetni tekshirib, qayta urinib ko'ring.", loaded: true });
    }
  },

  selectSchool: (id) => set({ currentSchoolId: id }),
}));
