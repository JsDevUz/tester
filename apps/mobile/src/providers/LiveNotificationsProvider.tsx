import React, {useEffect} from 'react';
import {connectLiveNotificationsSocket, closeLiveNotificationsSocket} from '../lib/liveNotificationsSocket';
import {useAuthStore} from '../store/authStore';
import {useLiveNotificationsStore} from '../store/liveNotificationsStore';

// Ilova ochilgan bo'lsa (token mavjud bo'lsa) HAR DOIM ulanadi — foydalanuvchi
// hech qanday classroom/messenger ekraniga kirmasdan turib ham, "jonli dars
// boshlandi" yoki "yangi xabar keldi" bildirishnomasini real-time oladi.
// Ilgari bunday global ulanish yo'q edi: LiveClassBanner faqat 60s polling
// bilan, MessengerScreen socketi esa faqat o'sha ekranga kirilganda ishlagan.
export function LiveNotificationsProvider({children}: {children: React.ReactNode}) {
  const token = useAuthStore(s => s.token);
  const addSession = useLiveNotificationsStore(s => s.addSession);
  const removeSession = useLiveNotificationsStore(s => s.removeSession);
  const markUnread = useLiveNotificationsStore(s => s.markUnread);

  useEffect(() => {
    if (!token) {
      closeLiveNotificationsSocket();
      return;
    }
    const socket = connectLiveNotificationsSocket(token);

    const onLiveSessionStarted = (payload: {sessionId: string; courseId: string; courseName: string}) => {
      addSession({
        id: payload.sessionId,
        courseId: payload.courseId,
        courseName: payload.courseName,
        startedAt: Date.now(),
      });
    };
    const onLiveSessionEnded = (payload: {sessionId: string}) => {
      removeSession(payload.sessionId);
    };
    const onNewMessage = () => {
      markUnread();
    };

    socket.on('liveSession:started', onLiveSessionStarted);
    socket.on('liveSession:ended', onLiveSessionEnded);
    socket.on('new_message', onNewMessage);

    return () => {
      socket.off('liveSession:started', onLiveSessionStarted);
      socket.off('liveSession:ended', onLiveSessionEnded);
      socket.off('new_message', onNewMessage);
    };
  }, [token, addSession, removeSession, markUnread]);

  return <>{children}</>;
}
