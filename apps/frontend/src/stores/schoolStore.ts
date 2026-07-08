import { create } from 'zustand';
import {
  apiGetSchool, apiUpdateSchool, apiRegenerateInviteToken,
  apiGetSchoolStaff, apiSearchStudents, apiAddSchoolStaff, apiRemoveSchoolStaff,
  type ApiStudentSearchResult,
} from '../api/school';

export type SchoolStaffRole = 'teacher_staff' | 'curator';

export interface SchoolStaff {
  id: string;
  studentId: string;
  name: string;
  email: string;
  role: SchoolStaffRole;
}

interface SchoolState {
  name: string;
  description: string;
  inviteToken: string;
  staff: SchoolStaff[];
  loaded: boolean;

  loadSchool: () => Promise<void>;
  renameSchool: (name: string) => Promise<void>;
  setSchoolDescription: (description: string) => Promise<void>;
  regenerateInviteToken: () => Promise<void>;
  loadStaff: () => Promise<void>;
  searchStudents: (query: string) => Promise<ApiStudentSearchResult[]>;
  addStaff: (studentId: string, role: SchoolStaffRole) => Promise<void>;
  removeStaff: (memberId: string) => Promise<void>;
}

export const useSchoolStore = create<SchoolState>((set, get) => ({
  name: '',
  description: '',
  inviteToken: '',
  staff: [],
  loaded: false,

  loadSchool: async () => {
    const school = await apiGetSchool();
    set({ name: school.name, description: school.description, inviteToken: school.inviteToken, loaded: true });
  },

  renameSchool: async (name) => {
    await apiUpdateSchool({ name });
    set({ name });
  },

  setSchoolDescription: async (description) => {
    await apiUpdateSchool({ description });
    set({ description });
  },

  regenerateInviteToken: async () => {
    const school = await apiRegenerateInviteToken();
    set({ inviteToken: school.inviteToken });
  },

  loadStaff: async () => {
    const rows = await apiGetSchoolStaff();
    set({
      staff: rows.map((r) => ({ id: r.id, studentId: r.studentId, name: r.name, email: r.email, role: r.role })),
    });
  },

  searchStudents: async (query) => {
    return apiSearchStudents(query);
  },

  addStaff: async (studentId, role) => {
    const row = await apiAddSchoolStaff(studentId, role);
    const staffMember: SchoolStaff = {
      id: row.id, studentId: row.studentId, name: row.name, email: row.email, role: row.role,
    };
    set({
      staff: [...get().staff.filter((s) => s.studentId !== studentId), staffMember],
    });
  },

  removeStaff: async (memberId) => {
    await apiRemoveSchoolStaff(memberId);
    set({ staff: get().staff.filter((s) => s.id !== memberId) });
  },
}));
