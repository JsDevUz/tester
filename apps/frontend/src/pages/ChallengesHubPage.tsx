import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Mic, Radio } from 'lucide-react';
import { StudentShell } from '../components/student/StudentShell';
import { ChallengesListPage } from './ChallengesListPage';

type HubView = 'hub' | 'challenges';

export function ChallengesHubPage() {
  const [view, setView] = useState<HubView>('hub');
  const navigate = useNavigate();

  if (view === 'challenges') {
    return <ChallengesListPage onBack={() => setView('hub')} />;
  }

  return (
    <StudentShell>
      <div className="p-6">
        <h1 className="mb-1 text-2xl font-extrabold text-gray-900">Jamm</h1>
        <p className="mb-6 text-sm text-gray-400">Kurs ichidagi faolliklar</p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => setView('challenges')}
            className="rounded-2xl bg-white p-5 text-left transition-colors hover:bg-gray-50"
          >
            <BookOpen size={24} className="mb-3 text-gray-700" />
            <p className="text-sm font-bold text-gray-900">Challenge-lar</p>
            <p className="mt-1 text-xs text-gray-400">Kitobxonlik challenge-lari</p>
          </button>

          <button
            type="button"
            onClick={() => navigate('/live/join')}
            className="rounded-2xl bg-white p-5 text-left transition-colors hover:bg-gray-50"
          >
            <Radio size={24} className="mb-3 text-gray-700" />
            <p className="text-sm font-bold text-gray-900">Jonli Musobaqalar</p>
            <p className="mt-1 text-xs text-gray-400">Real vaqtda musobaqa</p>
          </button>

          <div className="cursor-not-allowed rounded-2xl bg-white p-5 text-left opacity-50">
            <div className="mb-3 flex items-center justify-between">
              <Mic size={24} className="text-gray-700" />
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">Tez orada</span>
            </div>
            <p className="text-sm font-bold text-gray-900">Ovozli suhbat</p>
            <p className="mt-1 text-xs text-gray-400">Tez orada ishga tushadi</p>
          </div>
        </div>
      </div>
    </StudentShell>
  );
}
