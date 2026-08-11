import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuthStore } from "../stores/authStore";
import { connectPracticeMessengerSocket, closePracticeMessengerSocket } from "../api/practiceMessengerSocket";

interface LiveSessionStartedPayload {
  sessionId: string;
  courseId: string;
  courseName: string;
}

// PracticeMessengerGateway'ning umumiy user:<userId> xona-infratuzilmasini
// qayta ishlatadi (backend: apps/backend/src/practice-messenger/practice-messenger.gateway.ts,
// notifyUsers metodi) — talaba hali darsga qo'shilmagan (masalan kurslar
// ro'yxatida yoki boshqa sahifada) bo'lsa ham, ustoz jonli darsni boshlashi
// bilan real-time bildirishnoma oladi.
export function useLiveClassNotifications() {
  const token = useAuthStore((s) => s.token);
  const admin = useAuthStore((s) => s.admin);
  const navigate = useNavigate();

  useEffect(() => {
    if (!token || !admin || admin.role !== "student") return;
    const socket = connectPracticeMessengerSocket(token);

    function handleStarted(payload: LiveSessionStartedPayload) {
      toast.message("Jonli dars boshlandi", {
        description: payload.courseName,
        action: {
          label: "Kirish",
          onClick: () => navigate(`/classroom/${payload.sessionId}`),
        },
      });
    }

    socket.on("liveSession:started", handleStarted);
    return () => {
      socket.off("liveSession:started", handleStarted);
    };
  }, [token, admin?.id, admin?.role, navigate]);

  useEffect(() => {
    return () => {
      if (!useAuthStore.getState().token) closePracticeMessengerSocket();
    };
  }, []);
}
