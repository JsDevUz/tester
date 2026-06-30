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

const STATUS: Record<string, { label: string; color: string }> = {
  immediately: { label: "Natija ko'rinadi", color: 'bg-green-400' },
  after_deadline: { label: 'Muddat keyin',   color: 'bg-orange-400' },
  hidden:        { label: 'Natija yashirin', color: 'bg-gray-400' },
};

const HEADER_COLORS = [
  'from-indigo-400 to-indigo-600',
  'from-violet-400 to-violet-600',
  'from-sky-400 to-sky-600',
  'from-teal-400 to-teal-600',
  'from-rose-400 to-rose-600',
  'from-amber-400 to-amber-600',
  'from-emerald-400 to-emerald-600',
  'from-pink-400 to-pink-600',
];

function headerColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return HEADER_COLORS[h % HEADER_COLORS.length];
}

export function TestCard({ test, onEdit, onSettings, onDelete, onResults }: Props) {
  const [copied, setCopied] = useState(false);

  async function copyLink(e: React.MouseEvent) {
    e.stopPropagation();
    if (!test.slug) return;
    await navigator.clipboard.writeText(`${window.location.origin}/t/${test.slug}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const status = STATUS[test.showResults] ?? STATUS.immediately;
  const grad = headerColor(test.name);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
      {/* Colored header */}
      <div className={`bg-gradient-to-br ${grad} px-4 pt-4 pb-5`}>
        <p className="text-[10px] font-semibold text-white/60 uppercase tracking-widest mb-1">Test</p>
        <h3 className="text-base font-bold text-white leading-snug line-clamp-2">{test.name}</h3>
        {test.description && (
          <p className="text-xs text-white/70 mt-1 line-clamp-1">{test.description}</p>
        )}
      </div>

      {/* Action bar */}
      <div className="bg-gray-900 px-3 py-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${status.color}`} />
          <span className="text-[10px] text-gray-400">{status.label}</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onResults} title="Natijalar" className="text-gray-400 hover:text-white transition-colors"><BarChart2 size={14} /></button>
          <button onClick={onEdit}    title="Savollar"  className="text-gray-400 hover:text-white transition-colors"><Pencil   size={14} /></button>
          <button onClick={onSettings} title="Sozlamalar" className="text-gray-400 hover:text-white transition-colors"><Settings2 size={14} /></button>
          <button onClick={onDelete}  title="O'chirish" className="text-gray-400 hover:text-red-400 transition-colors"><Trash2  size={14} /></button>
        </div>
      </div>

      {/* Meta */}
      <div className="px-4 py-3 flex items-center gap-3 text-[11px] text-gray-400 flex-wrap">
        <span className="flex items-center gap-1">
          <Clock size={11} />{test.timeLimit ? `${test.timeLimit} daq` : '—'}
        </span>
        {test.shuffleQuestions && <Shuffle size={11} title="Aralashtiriladi" />}
        {test.oneByOne && <span className="font-medium">1×1</span>}
        {test.deadline && (
          <span className="flex items-center gap-1">
            <Calendar size={11} />{new Date(test.deadline).toLocaleDateString('uz-UZ')}
          </span>
        )}
        {test.slug && (
          <button onClick={copyLink} title="Linkni nusxalash" className="ml-auto text-indigo-400 hover:text-indigo-600 transition-colors">
            {copied ? <Check size={12} /> : <Link2 size={12} />}
          </button>
        )}
      </div>
    </div>
  );
}
