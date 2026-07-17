import { create } from 'zustand';
import {
  apiGetSchool, apiUpdateSchool, apiRegenerateInviteToken,
  apiGetSchoolStaff, apiSearchStudents, apiAddSchoolStaff, apiRemoveSchoolStaff,
  type ApiStudentSearchResult,
} from '../api/school';
import { persistLatest } from '../utils/latestPersistence';

export type SchoolStaffRole = 'teacher_staff' | 'curator';

export interface SchoolStaff {
  id: string;
  studentId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: SchoolStaffRole;
}

interface SchoolState {
  name: string;
  description: string;
  inviteToken: string;
  inviteRegenerationsRemaining: number;
  inviteRegenerationResetAt: string | null;
  staff: SchoolStaff[];
  staffTotal: number;
  staffLoading: boolean;
  staffLoaded: boolean;
  staffError: string | null;
  loaded: boolean;

  loadSchool: () => Promise<void>;
  renameSchool: (name: string) => Promise<void>;
  setSchoolDescription: (description: string) => Promise<void>;
  regenerateInviteToken: () => Promise<void>;
  loadStaff: (limit?: number, offset?: number) => Promise<void>;
  searchStudents: (query: string) => Promise<ApiStudentSearchResult[]>;
  addStaff: (studentId: string, role: SchoolStaffRole) => Promise<void>;
  removeStaff: (memberId: string) => Promise<void>;
}

export const useSchoolStore = create<SchoolState>((set, get) => ({
  name: '',
  description: '',
  inviteToken: '',
  inviteRegenerationsRemaining: 2,
  inviteRegenerationResetAt: null,
  staff: [],
  staffTotal: 0,
  staffLoading: false,
  staffLoaded: false,
  staffError: null,
  loaded: false,

  loadSchool: async () => {
    const school = await apiGetSchool();
    set({
      name: school.name,
      description: school.description,
      inviteToken: school.inviteToken,
      inviteRegenerationsRemaining: school.inviteRegenerationsRemaining,
      inviteRegenerationResetAt: school.inviteRegenerationResetAt,
      loaded: true,
    });
  },

  renameSchool: async (name) => {
    set({ name });
    persistLatest('school:name', () => apiUpdateSchool({ name }));
  },

  setSchoolDescription: async (description) => {
    set({ description });
    persistLatest('school:description', () => apiUpdateSchool({ description }));
  },

  regenerateInviteToken: async () => {
    const school = await apiRegenerateInviteToken();
    set({
      inviteToken: school.inviteToken,
      inviteRegenerationsRemaining: school.inviteRegenerationsRemaining,
      inviteRegenerationResetAt: school.inviteRegenerationResetAt,
    });
  },

  loadStaff: async (limit = 100, offset = 0) => {
    set({ staffLoading: true, staffError: null });
    try {
      const page = await apiGetSchoolStaff(limit, offset);
      set({
        staff: page.items.map((r) => ({ id: r.id, studentId: r.studentId, name: r.name, email: r.email, avatarUrl: r.avatarUrl, role: r.role })),
        staffTotal: page.total,
        staffLoaded: true,
      });
    } catch (error) {
      set({ staffError: "Xodimlarni yuklab bo'lmadi", staffLoaded: true });
      throw error;
    } finally {
      set({ staffLoading: false });
    }
  },

  searchStudents: async (query) => {
    return apiSearchStudents(query);
  },

  addStaff: async (studentId, role) => {
    const row = await apiAddSchoolStaff(studentId, role);
    const staffMember: SchoolStaff = {
      id: row.id, studentId: row.studentId, name: row.name, email: row.email, avatarUrl: row.avatarUrl, role: row.role,
    };
    set({
      staff: [...get().staff.filter((s) => s.studentId !== studentId), staffMember],
      staffTotal: get().staffTotal + (get().staff.some((s) => s.studentId === studentId) ? 0 : 1),
    });
  },

  removeStaff: async (memberId) => {
    await apiRemoveSchoolStaff(memberId);
    const hadMember = get().staff.some((s) => s.id === memberId);
    set({ staff: get().staff.filter((s) => s.id !== memberId), staffTotal: Math.max(0, get().staffTotal - (hadMember ? 1 : 0)) });
  },
}));
