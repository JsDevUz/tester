import {create} from 'zustand';
import type {ActiveClass} from '../types/api';

interface LiveNotificationsState {
  activeSessions: ActiveClass[];
  hasUnreadMessages: boolean;
  addSession: (session: ActiveClass) => void;
  removeSession: (sessionId: string) => void;
  setSessions: (sessions: ActiveClass[]) => void;
  markUnread: () => void;
  clearUnread: () => void;
}

// LiveNotificationsProvider (App.tsx) global socket orqali to'ldiradi —
// foydalanuvchi hech qanday ekranga "join" qilmasdan turib ham (masalan
// kurslar ro'yxatida), ustoz dars boshlaganda yoki yangi xabar kelganda
// shu store yangilanadi. LiveClassBanner va Messenger tab badge shu
// store'ni o'qiydi.
export const useLiveNotificationsStore = create<LiveNotificationsState>((set) => ({
  activeSessions: [],
  hasUnreadMessages: false,
  addSession: (session) =>
    set((state) => ({
      activeSessions: state.activeSessions.some((s) => s.id === session.id)
        ? state.activeSessions
        : [...state.activeSessions, session],
    })),
  removeSession: (sessionId) =>
    set((state) => ({
      activeSessions: state.activeSessions.filter((s) => s.id !== sessionId),
    })),
  setSessions: (sessions) => set({activeSessions: sessions}),
  markUnread: () => set({hasUnreadMessages: true}),
  clearUnread: () => set({hasUnreadMessages: false}),
}));
