import { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Clock, Calendar } from 'lucide-react';
import { apiGetPublicTest, apiStartSubmission, apiGetSubmission, type PublicTest } from '../api/delivery';
import { apiGetMe } from '../api/auth';
import { useAuthStore } from '../stores/authStore';

export function TakeTestEntryPage() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [test, setTest] = useState<PublicTest | null>(null);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const adminName = useAuthStore((s) => s.admin?.name ?? null);
  const token = useAuthStore((s) => s.token);
  const [loggedInName, setLoggedInName] = useState<string | null>(null);

  useEffect(() => {
    if (adminName) { setLoggedInName(adminName); setName(adminName); return; }
    if (token) {
      apiGetMe().then((me) => { setLoggedInName(me.name); setName(me.name); }).catch(() => {});
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!slug) return;

    const sid = searchParams.get('sid');

    // If sid in URL — check submission status
    if (sid) {
      apiGetSubmission(sid)
        .then((sub) => {
          if (sub.status === 'submitted') {
            // Already submitted — go to result
            navigate(`/t/${slug}/result?sid=${sid}`, { replace: true });
          } else {
            // In progress — resume test
            navigate(`/t/${slug}/take?sid=${sid}`, { replace: true });
          }
        })
        .catch(() => {
          // Invalid sid — load test normally
          apiGetPublicTest(slug).then(setTest).catch(() => setError('Test topilmadi.')).finally(() => setLoading(false));
        });
      return;
    }

    apiGetPublicTest(slug)
      .then(setTest)
      .catch(() => setError('Test topilmadi.'))
      .finally(() => setLoading(false));
  }, [slug]);

  async function handleStart(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !slug) return;
    setStarting(true);
    try {
      const { submissionId } = await apiStartSubmission(slug, name.trim());
      navigate(`/t/${slug}/take?sid=${submissionId}`);
    } catch {
      setError("Xato yuz berdi. Qayta urinib ko'ring.");
    } finally {
      setStarting(false);
    }
  }

  if (loading) return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-indigo-50 flex items-center justify-center">
      <p className="text-gray-400">Yuklanmoqda...</p>
    </div>
  );

  if (error || !test) return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-indigo-50 flex items-center justify-center">
      <p className="text-red-400">{error ?? 'Test topilmadi.'}</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-indigo-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
        <div className="flex gap-1.5 mb-6">
          <span className="w-3 h-3 rounded-full bg-red-400" />
          <span className="w-3 h-3 rounded-full bg-yellow-400" />
          <span className="w-3 h-3 rounded-full bg-green-400" />
        </div>
        <h1 className="text-2xl font-semibold text-gray-800 mb-1">{test.name}</h1>
        {test.description && <p className="text-base text-gray-500 mb-4">{test.description}</p>}
        <div className="flex gap-2 flex-wrap mb-6">
          {test.timeLimit && (
            <span className="flex items-center gap-1 text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded-lg">
              <Clock size={11} /> {test.timeLimit} daqiqa
            </span>
          )}
          {test.deadline && (
            <span className="flex items-center gap-1 text-xs bg-orange-50 text-orange-600 px-2 py-1 rounded-lg">
              <Calendar size={11} /> {new Date(test.deadline).toLocaleString()}
            </span>
          )}
        </div>
        <form onSubmit={handleStart} className="flex flex-col gap-3">
          {loggedInName ? (
            <div className="w-full border border-gray-100 bg-gray-50 rounded-xl px-4 py-3 text-base text-gray-700">
              {loggedInName}
            </div>
          ) : (
            <input
              autoFocus value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Ismingizni kiriting"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base outline-none focus:ring-2 focus:ring-indigo-400"
            />
          )}
          <button
            type="submit" disabled={!name.trim() || starting}
            className="w-full bg-indigo-500 text-white rounded-xl py-3 text-base font-medium hover:bg-indigo-600 disabled:opacity-40"
          >
            {starting ? 'Boshlanmoqda...' : 'Testni boshlash'}
          </button>
        </form>
      </div>
    </div>
  );
}
