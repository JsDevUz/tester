import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, Radio, ChevronRight } from 'lucide-react';
import { Toolbar } from '../components/Toolbar';
import { apiLiveTests, apiCreateLiveSession, type LiveTestItem } from '../api/live';

const TIMES = [10, 20, 30, 60];

export function LiveCreatePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [tests, setTests] = useState<LiveTestItem[]>([]);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get('testId'));
  const [timeSec, setTimeSec] = useState(20);
  const [mode, setMode] = useState<'individual' | 'team'>('individual');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { apiLiveTests().then(setTests); }, []);

  const filtered = tests.filter((t) => t.name.toLowerCase().includes(query.toLowerCase()));
  const selected = tests.find((t) => t.id === selectedId) ?? null;

  async function handleCreate() {
    if (!selectedId || creating) return;
    setCreating(true);
    setError(null);
    try {
      const { pin } = await apiCreateLiveSession(selectedId, timeSec, mode);
      navigate(`/live/host/${pin}`);
    } catch (e: any) {
      const msg = e?.response?.data?.message;
      setError(msg === 'NO_LIVE_QUESTIONS'
        ? "Bu testda live uchun mos savol yo'q (yagona / ko'p tanlov / to'g'ri-noto'g'ri kerak)."
        : "Xato yuz berdi. Qayta urinib ko'ring.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Toolbar />
      <div className="flex-1 max-w-2xl mx-auto w-full px-4 py-6">
        <div className="flex items-center gap-2 mb-5">
          <Radio size={20} className="text-indigo-500" />
          <h2 className="text-lg font-bold text-gray-800">Live o'yin yaratish</h2>
        </div>

        {/* Test tanlash */}
        <p className="text-sm font-semibold text-gray-700 mb-2">Test tanlang</p>
        <div className="relative mb-2">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-300" />
          <input
            value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Test nomini qidiring..."
            className="w-full bg-white border-2 border-gray-100 rounded-2xl pl-10 pr-4 py-3 text-sm outline-none focus:border-indigo-400 transition-colors"
          />
        </div>
        <div className="flex flex-col gap-1.5 mb-6 max-h-72 overflow-y-auto">
          {filtered.map((t) => (
            <button key={t.id} onClick={() => setSelectedId(t.id)}
              className={`w-full text-left px-4 py-3 rounded-2xl border-2 transition-all flex items-center justify-between gap-2 ${
                selectedId === t.id
                  ? 'bg-indigo-500 border-indigo-500 text-white'
                  : 'bg-white border-gray-100 text-gray-700 hover:border-indigo-200'
              }`}>
              <span className="text-sm font-medium truncate">{t.name}</span>
              <span className={`text-xs shrink-0 ${selectedId === t.id ? 'text-white/70' : 'text-gray-400'}`}>
                {t.liveQuestionCount} savol
              </span>
            </button>
          ))}
          {filtered.length === 0 && <p className="text-sm text-gray-400 text-center py-4">Test topilmadi</p>}
        </div>

        {/* Vaqt tanlash */}
        <p className="text-sm font-semibold text-gray-700 mb-2">Har savolga vaqt</p>
        <div className="flex gap-2 mb-6">
          {TIMES.map((t) => (
            <button key={t} onClick={() => setTimeSec(t)}
              className={`flex-1 py-3 rounded-2xl border-2 font-semibold text-sm transition-all ${
                timeSec === t
                  ? 'bg-indigo-500 border-indigo-500 text-white'
                  : 'bg-white border-gray-100 text-gray-600 hover:border-indigo-200'
              }`}>
              {t}s
            </button>
          ))}
        </div>

        {/* Rejim tanlash */}
        <p className="text-sm font-semibold text-gray-700 mb-2">O'yin rejimi</p>
        <div className="flex gap-2 mb-6">
          <button onClick={() => setMode('individual')}
            className={`flex-1 py-3 rounded-2xl border-2 font-semibold text-sm transition-all ${
              mode === 'individual'
                ? 'bg-indigo-500 border-indigo-500 text-white'
                : 'bg-white border-gray-100 text-gray-600 hover:border-indigo-200'
            }`}>
            Yakka
          </button>
          <button onClick={() => setMode('team')}
            className={`flex-1 py-3 rounded-2xl border-2 font-semibold text-sm transition-all ${
              mode === 'team'
                ? 'bg-indigo-500 border-indigo-500 text-white'
                : 'bg-white border-gray-100 text-gray-600 hover:border-indigo-200'
            }`}>
            Jamoaviy
          </button>
        </div>

        {error && <p className="text-sm text-red-400 mb-3">{error}</p>}

        <button onClick={handleCreate} disabled={!selected || creating}
          className="w-full py-4 bg-indigo-500 text-white rounded-2xl font-semibold text-base flex items-center justify-center gap-2 hover:bg-indigo-600 disabled:opacity-40 transition-colors shadow-lg shadow-indigo-100">
          {creating ? 'Yaratilmoqda...' : <><span>Sessiya yaratish</span><ChevronRight size={18} /></>}
        </button>
      </div>
    </div>
  );
}
