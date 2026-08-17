import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiGetSchoolJoinPreview, apiJoinSchool } from '../api/school';
import { apiGetMe } from '../api/auth';
import { useAuthStore } from '../stores/authStore';

export function SchoolInviteJoinPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const authToken = useAuthStore((s) => s.token);
  const student = useAuthStore((s) => s.admin);

  const [preview, setPreview] = useState<{ schoolName: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);
  const [checkingSession, setCheckingSession] = useState(Boolean(authToken && !student));

  useEffect(() => {
    if (!token) return;
    apiGetSchoolJoinPreview(token)
      .then(setPreview)
      .catch(() => setError('Havola topilmadi yoki muddati tugagan.'));
  }, [token]);

  useEffect(() => {
    if (!authToken || student) return;
    apiGetMe()
      .then((me) => useAuthStore.setState({ admin: me }))
      .catch(() => useAuthStore.getState().logout())
      .finally(() => setCheckingSession(false));
  }, [authToken, student]);

  async function handleJoin() {
    if (!token) return;
    setJoining(true);
    setError(null);
    try {
      await apiJoinSchool(token);
      setJoined(true);
    } catch (e: any) {
      const message = e?.response?.data?.message;
      setError(typeof message === 'string' ? message : "Maktabga qo'shilishda xatolik yuz berdi.");
    } finally {
      setJoining(false);
    }
  }

  if (checkingSession) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--app-bg)] p-4">
        <p className="text-xs font-semibold text-[var(--text-muted)]">Yuklanmoqda...</p>
      </div>
    );
  }

  if (!student) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--app-bg)] p-4 text-[var(--text-primary)]">
        <div className="glass-panel w-full max-w-sm rounded-3xl p-6 text-center shadow-2xl space-y-4">
          <p className="text-xs font-medium text-[var(--text-muted)]">
            Maktabga qo'shilish uchun avval tizimga kiring.
          </p>
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="w-full rounded-xl bg-indigo-600 py-2.5 text-xs font-bold text-white shadow-xs transition-colors hover:bg-indigo-700 cursor-pointer"
          >
            Kirish
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--app-bg)] p-4 text-[var(--text-primary)]">
      <div className="glass-panel w-full max-w-sm rounded-3xl p-6 text-center shadow-2xl space-y-4">
        {error && (
          <>
            <p className="text-xs font-semibold text-red-500">{error}</p>
            <button
              type="button"
              onClick={() => navigate('/')}
              className="w-full rounded-xl bg-[var(--card-bg)] py-2.5 text-xs font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--card-hover)] cursor-pointer"
            >
              Orqaga qaytish
            </button>
          </>
        )}

        {!error && !preview && <p className="text-xs font-semibold text-[var(--text-muted)]">Yuklanmoqda...</p>}

        {preview && !joined && (
          <>
            <div>
              <p className="text-base font-bold text-[var(--text-primary)] tracking-tight">{preview.schoolName}</p>
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">Ushbu maktabga qo'shilasiz</p>
            </div>
            <button
              type="button"
              onClick={handleJoin}
              disabled={joining}
              className="w-full rounded-xl bg-indigo-600 py-2.5 text-xs font-bold text-white shadow-xs transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
            >
              {joining ? "Qo'shilmoqda..." : "Maktabga qo'shilish"}
            </button>
          </>
        )}

        {joined && (
          <>
            <p className="text-xs font-bold text-emerald-500">
              Muvaffaqiyatli qo'shildingiz!
            </p>
            <button
              type="button"
              onClick={() => navigate('/')}
              className="w-full rounded-xl bg-indigo-600 py-2.5 text-xs font-bold text-white shadow-xs transition-colors hover:bg-indigo-700 cursor-pointer"
            >
              Davom etish
            </button>
          </>
        )}
      </div>
    </div>
  );
}
