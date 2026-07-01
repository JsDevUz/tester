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

const actionButtonClass = 'w-8 h-8 inline-flex items-center justify-center rounded-lg text-gray-400 hover:bg-white/10 hover:text-white transition-colors';
const actionIconSize = 17;

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
      <div className="h-[88px] px-4 pt-4 pb-3 shrink-0">
        <p className="text-[10px] text-gray-400 uppercase tracking-wide font-medium mb-1">Test</p>
        <p className="text-sm font-bold text-gray-800 leading-snug line-clamp-1">{test.name}</p>
        <p className="min-h-[28px] text-[11px] text-gray-400 line-clamp-2 leading-snug mt-1">
          {test.description || '\u00A0'}
        </p>
      </div>

      {/* Dark action bar */}
      <div className="h-[52px] bg-gray-900 px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-1.5 min-w-0 max-w-[98px]">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${status.dot}`} />
          <span className="text-[11px] text-gray-300 truncate">{status.label}</span>
        </div>
        <div className="flex items-center gap-2.5 shrink-0 ml-3">
          <button onClick={onResults}  title="Natijalar"  className={actionButtonClass}><BarChart2 size={actionIconSize} /></button>
          <button onClick={onEdit}     title="Savollar"   className={actionButtonClass}><Pencil    size={actionIconSize} /></button>
          <button onClick={onSettings} title="Sozlamalar" className={actionButtonClass}><Settings2 size={actionIconSize} /></button>
          <button onClick={onDelete}   title="O'chirish"  className={`${actionButtonClass} hover:text-red-400`}><Trash2   size={actionIconSize} /></button>
        </div>
      </div>

      {/* Info list — like feature list in the reference */}
      <div className="px-4 py-3 flex flex-1 flex-col gap-2 min-h-0">
        <div className="flex h-4 items-center gap-2 text-xs text-gray-600">
          <Clock size={13} className="text-gray-400 shrink-0" />
          <span className="truncate">{test.timeLimit ? `${test.timeLimit} daqiqa` : 'Vaqt cheklanmagan'}</span>
        </div>
        <div className="flex h-4 items-center gap-2 text-xs text-gray-600">
          <Shuffle size={13} className="text-gray-400 shrink-0" />
          <span className="truncate">{test.shuffleQuestions ? "Savollar aralashtiriladi" : "Savollar tartibli"}</span>
        </div>
        {test.deadline ? (
          <div className="flex h-4 items-center gap-2 text-xs text-gray-600">
            <Calendar size={13} className="text-gray-400 shrink-0" />
            <span className="truncate">{new Date(test.deadline).toLocaleDateString('uz-UZ', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
          </div>
        ) : (
          <div className="flex h-4 items-center gap-2 text-xs text-gray-400">
            <Calendar size={13} className="shrink-0" />
            <span className="truncate">Muddat belgilanmagan</span>
          </div>
        )}
        {test.slug ? (
          <button onClick={copyLink}
            className="flex h-4 items-center gap-2 text-xs text-indigo-500 hover:text-indigo-700 transition-colors text-left">
            {copied ? <Check size={13} className="shrink-0" /> : <Link2 size={13} className="shrink-0" />}
            <span className="truncate">{copied ? 'Nusxalandi!' : 'Havola nusxalash'}</span>
          </button>
        ) : (
          <div className="flex h-4 items-center gap-2 text-xs text-gray-300">
            <Link2 size={13} className="shrink-0" />
            <span className="truncate">Havola yo'q</span>
          </div>
        )}
      </div>
    </div>
  );
}
