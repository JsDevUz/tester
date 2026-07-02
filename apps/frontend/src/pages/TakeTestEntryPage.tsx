import { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Clock, Calendar, ChevronRight, Lock, FileText } from 'lucide-react';
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
    if (sid) {
      apiGetSubmission(sid)
        .then((sub) => {
          if (sub.status === 'submitted') {
            navigate(`/t/${slug}/result?sid=${sid}`, { replace: true });
          } else {
            navigate(`/t/${slug}/take?sid=${sid}`, { replace: true });
          }
        })
        .catch(() => {
          apiGetPublicTest(slug).then(setTest).catch(() => setError('Test topilmadi.')).finally(() => setLoading(false));
        });
      return;
    }
    apiGetPublicTest(slug)
      .then(setTest)
      .catch(() => setError('Test topilmadi.'))
      .finally(() => setLoading(false));
  }, [slug]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleStart(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !slug) return;
    setStarting(true);
    try {
      const { submissionId } = await apiStartSubmission(slug, name.trim());
      navigate(`/t/${slug}/take?sid=${submissionId}`);
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      if (msg === 'AUTH_REQUIRED') {
        navigate(`/login?redirect=/t/${slug}`);
      } else {
        setError("Xato yuz berdi. Qayta urinib ko'ring.");
      }
    } finally {
      setStarting(false);
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen bg-white">
      <div className="w-8 h-8 rounded-full border-3 border-indigo-200 border-t-indigo-500 animate-spin" />
    </div>
  );

  if (error || !test) return (
    <div className="flex items-center justify-center min-h-screen bg-white p-6">
      <p className="text-red-400 text-center">{error ?? 'Test topilmadi.'}</p>
    </div>
  );

  if ((test as any).requireAuth && !token) return (
    <div
      className="flex flex-col bg-white"
      style={{ height: '100dvh', paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}
    >
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center mb-5">
          <Lock size={28} className="text-indigo-400" />
        </div>
        <p className="text-xl font-bold text-gray-900 mb-2">Kirish talab etiladi</p>
        <p className="text-sm text-gray-400 mb-8">Bu test faqat tizimga kirgan foydalanuvchilar uchun.</p>
        <button
          onClick={() => navigate(`/login?redirect=/t/${slug}`)}
          className="w-full max-w-xs py-4 bg-indigo-500 text-white rounded-2xl font-semibold text-base hover:bg-indigo-600 transition-colors shadow-lg shadow-indigo-100"
        >
          Kirish
        </button>
      </div>
    </div>
  );

  return (
    <div
      className="flex flex-col bg-white notranslate"
      translate="no"
      style={{ height: '100dvh', paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}
    >
      {/* Top accent bar */}
      <div className="shrink-0 h-1 bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400" />

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-6 pt-10 pb-4">
        {/* Icon */}
        <div className="w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center mb-6">
          <FileText size={28} className="text-indigo-400" />
        </div>

        {/* Title & description */}
        <h1 className="text-2xl font-bold text-gray-900 leading-tight mb-2">{test.name}</h1>
        {test.description && (
          <p className="text-base text-gray-500 mb-5 leading-relaxed">{test.description}</p>
        )}

        {/* Meta chips */}
        {(test.timeLimit || test.deadline) && (
          <div className="flex gap-2 flex-wrap mb-6">
            {test.timeLimit && (
              <span className="flex items-center gap-1.5 text-sm bg-blue-50 text-blue-600 px-3 py-1.5 rounded-xl font-medium">
                <Clock size={13} /> {test.timeLimit} daqiqa
              </span>
            )}
            {test.deadline && (
              <span className="flex items-center gap-1.5 text-sm bg-orange-50 text-orange-600 px-3 py-1.5 rounded-xl font-medium">
                <Calendar size={13} /> {new Date(test.deadline).toLocaleString()}
              </span>
            )}
          </div>
        )}

        {/* Divider */}
        <div className="h-px bg-gray-100 mb-6" />

        {/* Name field */}
        <p className="text-sm font-semibold text-gray-700 mb-2">Ismingiz</p>
        {loggedInName ? (
          <div className="w-full bg-gray-50 border-2 border-gray-100 rounded-2xl px-4 py-3.5 text-base text-gray-700 mb-2">
            {loggedInName}
          </div>
        ) : (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) handleStart(e as any); }}
            placeholder="Ismingizni kiriting"
            className="w-full bg-gray-50 border-2 border-gray-100 rounded-2xl px-4 py-3.5 text-base outline-none focus:border-indigo-400 focus:bg-white transition-colors mb-2"
          />
        )}

        {error && <p className="text-sm text-red-400 mt-1">{error}</p>}
      </div>

      {/* Bottom button */}
      <div className="shrink-0 px-6 pt-3">
        <button
          onClick={handleStart}
          disabled={!name.trim() || starting}
          className="w-full py-4 bg-indigo-500 text-white rounded-2xl font-semibold text-base flex items-center justify-center gap-2 hover:bg-indigo-600 disabled:opacity-40 transition-colors shadow-lg shadow-indigo-100"
        >
          {starting ? 'Boshlanmoqda...' : <><span>Testni boshlash</span><ChevronRight size={18} /></>}
        </button>
      </div>
    </div>
  );
}
