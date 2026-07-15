import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuthStore } from '../stores/authStore';
import { usePracticeMessengerStore } from '../stores/practiceMessengerStore';
import {
  connectPracticeMessengerSocket,
  closePracticeMessengerSocket,
  type PracticeMessengerSocketPayload,
} from '../api/practiceMessengerSocket';

const MESSAGE_TYPE_LABEL: Record<string, string> = {
  text: '',
  practice_test: 'Test amaliyoti natijasini yubordi',
  practice_image: 'Rasmli topshiriqqa rasm yubordi',
  practice_grade: 'Amaliyot baholandi',
};

export function usePracticeMessengerNotifications() {
  const token = useAuthStore((s) => s.token);
  const admin = useAuthStore((s) => s.admin);
  const location = useLocation();
  const navigate = useNavigate();
  const markChatUnread = usePracticeMessengerStore((s) => s.markChatUnread);
  const loadUnread = usePracticeMessengerStore((s) => s.loadUnread);

  const pathnameRef = useRef(location.pathname);
  pathnameRef.current = location.pathname;
  const activeChatIdRef = useRef(usePracticeMessengerStore.getState().activeChatId);
  useEffect(
    () => usePracticeMessengerStore.subscribe((state) => {
      activeChatIdRef.current = state.activeChatId;
    }),
    [],
  );

  useEffect(() => {
    if (!token || !admin) return;
    void loadUnread();

    const socket = connectPracticeMessengerSocket(token);

    function handleNewMessage(payload: PracticeMessengerSocketPayload) {
      const onMessengerPage = pathnameRef.current.startsWith('/messenger');
      const viewingThisChat = onMessengerPage && activeChatIdRef.current === payload.chatId;

      markChatUnread(payload.chatId);

      if (!viewingThisChat) {
        const label = MESSAGE_TYPE_LABEL[payload.type] || payload.content;
        toast.message('Yangi xabar', {
          description: label || payload.content,
          action: {
            label: 'Ochish',
            onClick: () => navigate('/messenger'),
          },
        });
      }
    }

    socket.on('new_message', handleNewMessage);
    return () => {
      socket.off('new_message', handleNewMessage);
    };
  }, [token, admin?.id, markChatUnread, loadUnread, navigate]);

  useEffect(() => {
    return () => {
      if (!useAuthStore.getState().token) closePracticeMessengerSocket();
    };
  }, []);
}
