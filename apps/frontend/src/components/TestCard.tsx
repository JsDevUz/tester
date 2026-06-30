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

const PALETTES: [string, string, string][] = [
  ['#a5b4fc', '#818cf8', '#6366f1'],
  ['#93c5fd', '#60a5fa', '#3b82f6'],
  ['#6ee7b7', '#34d399', '#10b981'],
  ['#fca5a5', '#f87171', '#ef4444'],
  ['#fcd34d', '#fbbf24', '#f59e0b'],
  ['#f9a8d4', '#f472b6', '#ec4899'],
  ['#5eead4', '#2dd4bf', '#14b8a6'],
  ['#c4b5fd', '#a78bfa', '#8b5cf6'],
];

function palette(name: string): [string, string, string] {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return PALETTES[h % PALETTES.length];
}

export function TestCard({ test, onEdit, onSettings, onDelete, onResults }: Props) {
  const [copied, setCopied] = useState(false);
  const status = STATUS[test.showResults] ?? STATUS.immediately;
  const [c1, c2, c3] = palette(test.name);

  async function copyLink(e: React.MouseEvent) {
    e.stopPropagation();
    if (!test.slug) return;
    await navigator.clipboard.writeText(`${window.location.origin}/t/${test.slug}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">

      {/* Gradient blur header */}
      <div className="relative h-28 overflow-hidden" style={{ background: '#f5f5fa' }}>
        <div className="absolute w-36 h-36 rounded-full blur-3xl opacity-70 -top-8 -left-8"  style={{ background: c1 }} />
        <div className="absolute w-32 h-32 rounded-full blur-3xl opacity-60 bottom-0 left-1/3" style={{ background: c2 }} />
        <div className="absolute w-28 h-28 rounded-full blur-3xl opacity-50 -top-4 -right-4"  style={{ background: c3 }} />

        <div className="absolute inset-0 px-4 py-3 flex flex-col justify-between">
          <div>
            <p className="text-[10px] text-gray-400/80 uppercase tracking-wide font-medium mb-0.5">Test</p>
            <p className="text-sm font-bold text-gray-800 leading-snug line-clamp-1">{test.name}</p>
          </div>
          {test.description && (
            <p className="text-[11px] text-gray-500 line-clamp-2 leading-snug">{test.description}</p>
          )}
        </div>
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
