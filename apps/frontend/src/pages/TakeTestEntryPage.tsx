import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiGetPublicTest, apiStartSubmission, type PublicTest } from '../api/delivery';

export function TakeTestEntryPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [test, setTest] = useState<PublicTest | null>(null);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
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
      setError('Xato yuz berdi. Qayta urinib ko\'ring.');
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
        <h1 className="text-xl font-semibold text-gray-800 mb-1">{test.name}</h1>
        {test.description && <p className="text-sm text-gray-500 mb-4">{test.description}</p>}
        <div className="flex gap-2 flex-wrap mb-6">
          {test.timeLimit && (
            <span className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded-lg">⏱ {test.timeLimit} daqiqa</span>
          )}
          {test.deadline && (
            <span className="text-xs bg-orange-50 text-orange-600 px-2 py-1 rounded-lg">
              📅 {new Date(test.deadline).toLocaleString()}
            </span>
          )}
        </div>
        <form onSubmit={handleStart} className="flex flex-col gap-3">
          <input
            autoFocus value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Ismingizni kiriting"
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-400"
          />
          <button
            type="submit" disabled={!name.trim() || starting}
            className="w-full bg-indigo-500 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-indigo-600 disabled:opacity-40"
          >
            {starting ? 'Boshlanmoqda...' : 'Testni boshlash'}
          </button>
        </form>
      </div>
    </div>
  );
}
