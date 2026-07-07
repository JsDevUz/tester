import { create } from 'zustand';
import { useAuthStore } from './authStore';

export type SchoolStaffRole = 'admin' | 'teacher' | 'curator';

export interface SchoolStaff {
  id: string;
  name: string;
  email: string;
  role: SchoolStaffRole;
}

interface SchoolState {
  name: string;
  description: string;
  staff: SchoolStaff[];
  inviteToken: string;

  renameSchool: (name: string) => void;
  setSchoolDescription: (description: string) => void;
  addStaff: (data: Omit<SchoolStaff, 'id'>) => void;
  removeStaff: (staffId: string) => void;
  regenerateInviteToken: () => void;
}

function newId(): string {
  return crypto.randomUUID();
}

function buildInitialStaff(): SchoolStaff[] {
  const currentAdminName = useAuthStore.getState().admin?.name ?? 'Administrator';
  return [
    { id: newId(), name: currentAdminName, email: 'admin@maktab.uz', role: 'admin' },
    { id: newId(), name: 'Dilshod Rahimov', email: 'dilshod@maktab.uz', role: 'teacher' },
    { id: newId(), name: 'Zarina Yoldosheva', email: 'zarina@maktab.uz', role: 'curator' },
  ];
}

export const useSchoolStore = create<SchoolState>((set, get) => ({
  name: 'Mening maktabim',
  description: '',
  staff: buildInitialStaff(),
  inviteToken: newId(),

  renameSchool: (name) => set({ name }),
  setSchoolDescription: (description) => set({ description }),
  addStaff: (data) => {
    const staffMember: SchoolStaff = { ...data, id: newId() };
    set({ staff: [...get().staff, staffMember] });
  },
  removeStaff: (staffId) => {
    set({ staff: get().staff.filter((s) => s.id !== staffId) });
  },
  regenerateInviteToken: () => set({ inviteToken: newId() }),
}));
