import { useState } from 'react';
import { Clock, Shuffle, Calendar, Link2, Check, BarChart2, Settings2, Trash2, Pencil } from 'lucide-react';
import type { Test } from '../api/tests';

interface Props {
  test: Test;
  onEdit: () => void;
  onSettings: () => void;
  onDelete: () => void;
  onResults: () => void;
}

const STATUS: Record<string, { label: string; dot: string }> = {
  immediately: { label: "Natija ko'rinadi", dot: 'bg-green-400' },
  after_deadline: { label: 'Muddat keyin',   dot: 'bg-orange-400' },
  hidden:        { label: 'Natija yashirin', dot: 'bg-gray-400' },
};

export function TestCard({ test, onEdit, onSettings, onDelete, onResults }: Props) {
  const [copied, setCopied] = useState(false);
  const status = STATUS[test.showResults] ?? STATUS.immediately;

  async function copyLink(e: React.MouseEvent) {
    e.stopPropagation();
    if (!test.slug) return;
    await navigator.clipboard.writeText(`${window.location.origin}/t/${test.slug}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">

      {/* Header */}
      <div className="px-4 pt-4 pb-3">
        <p className="text-[10px] text-gray-400 uppercase tracking-wide font-medium mb-1">Test</p>
        <p className="text-sm font-bold text-gray-800 leading-snug line-clamp-1">{test.name}</p>
        {test.description && (
          <p className="text-[11px] text-gray-400 line-clamp-2 leading-snug mt-1">{test.description}</p>
        )}
      </div>

      {/* Dark action bar */}
      <div className="bg-gray-900 px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${status.dot}`} />
          <span className="text-[11px] text-gray-300 truncate">{status.label}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          <button onClick={onResults}  title="Natijalar"  className="text-gray-400 hover:text-white transition-colors"><BarChart2 size={14} /></button>
          <button onClick={onEdit}     title="Savollar"   className="text-gray-400 hover:text-white transition-colors"><Pencil    size={14} /></button>
          <button onClick={onSettings} title="Sozlamalar" className="text-gray-400 hover:text-white transition-colors"><Settings2 size={14} /></button>
          <button onClick={onDelete}   title="O'chirish"  className="text-gray-400 hover:text-red-400 transition-colors"><Trash2   size={14} /></button>
        </div>
      </div>

      {/* Info list — like feature list in the reference */}
      <div className="px-4 py-3 flex flex-col gap-2">
        <div className="flex items-center gap-2 text-xs text-gray-600">
          <Clock size={13} className="text-gray-400 shrink-0" />
          <span>{test.timeLimit ? `${test.timeLimit} daqiqa` : 'Vaqt cheklanmagan'}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-600">
          <Shuffle size={13} className="text-gray-400 shrink-0" />
          <span>{test.shuffleQuestions ? "Savollar aralashtiriladi" : "Savollar tartibli"}</span>
        </div>
        {test.deadline ? (
          <div className="flex items-center gap-2 text-xs text-gray-600">
            <Calendar size={13} className="text-gray-400 shrink-0" />
            <span>{new Date(test.deadline).toLocaleDateString('uz-UZ', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <Calendar size={13} className="shrink-0" />
            <span>Muddat belgilanmagan</span>
          </div>
        )}
        {test.slug ? (
          <button onClick={copyLink}
            className="flex items-center gap-2 text-xs text-indigo-500 hover:text-indigo-700 transition-colors text-left">
            {copied ? <Check size={13} className="shrink-0" /> : <Link2 size={13} className="shrink-0" />}
            <span>{copied ? 'Nusxalandi!' : 'Havola nusxalash'}</span>
          </button>
        ) : (
          <div className="flex items-center gap-2 text-xs text-gray-300">
            <Link2 size={13} className="shrink-0" />
            <span>Havola yo'q</span>
          </div>
        )}
      </div>
    </div>
  );
}
