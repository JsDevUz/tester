import { create } from 'zustand';
import { apiGetMySchools, type ApiMySchool } from '../api/groups';

interface StudentSchoolState {
  schools: ApiMySchool[];
  currentSchoolId: string | null;
  loaded: boolean;
  loadSchools: () => Promise<void>;
  selectSchool: (id: string) => void;
}

export const useStudentSchoolStore = create<StudentSchoolState>((set) => ({
  schools: [],
  currentSchoolId: null,
  loaded: false,

  loadSchools: async () => {
    const schools = await apiGetMySchools();
    set({ schools, loaded: true });
  },

  selectSchool: (id) => set({ currentSchoolId: id }),
}));
