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
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
        <p className="text-sm text-gray-400">Yuklanmoqda...</p>
      </div>
    );
  }

  if (!student) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
        <div className="w-full max-w-sm rounded-3xl bg-white p-6 text-center">
          <p className="mb-4 text-sm text-gray-600">
            Maktabga qo'shilish uchun avval tizimga kiring.
          </p>
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="w-full rounded-2xl bg-indigo-500 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-600"
          >
            Kirish
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 text-center">
        {error && <p className="mb-4 text-sm text-red-500">{error}</p>}

        {!error && !preview && <p className="text-sm text-gray-400">Yuklanmoqda...</p>}

        {preview && !joined && (
          <>
            <p className="mb-1 text-lg font-bold text-gray-800">{preview.schoolName}</p>
            <p className="mb-4 text-sm text-gray-500">Ushbu maktabga qo'shilasiz</p>
            <button
              type="button"
              onClick={handleJoin}
              disabled={joining}
              className="w-full rounded-2xl bg-indigo-500 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-600 disabled:opacity-50"
            >
              {joining ? "Qo'shilmoqda..." : "Maktabga qo'shilish"}
            </button>
          </>
        )}

        {joined && (
          <p className="text-sm font-semibold text-green-600">
            Muvaffaqiyatli qo'shildingiz!
          </p>
        )}
      </div>
    </div>
  );
}
