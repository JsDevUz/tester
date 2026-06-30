import { useState } from 'react';
import { Clock, Shuffle, Calendar, Link2, Check } from 'lucide-react';
import type { Test } from '../api/tests';

interface Props {
  test: Test;
  onDoubleClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  immediately: { label: 'Natija ko\'rinadi', className: 'bg-green-100 text-green-700' },
  after_deadline: { label: 'Muddat keyin', className: 'bg-orange-100 text-orange-700' },
  hidden:        { label: 'Natija yashirin', className: 'bg-gray-100 text-gray-500' },
};

// Deterministic pastel from string hash
function colorFromName(name: string): string {
  const palettes = [
    ['#fca5a5', '#ef4444'], // red
    ['#fdba74', '#f97316'], // orange
    ['#fde68a', '#f59e0b'], // amber
    ['#86efac', '#22c55e'], // green
    ['#93c5fd', '#3b82f6'], // blue
    ['#c4b5fd', '#8b5cf6'], // violet
    ['#f9a8d4', '#ec4899'], // pink
    ['#5eead4', '#14b8a6'], // teal
  ];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  const [light, base] = palettes[h % palettes.length];
  return `linear-gradient(135deg, ${light} 0%, ${base} 100%)`;
}

export function TestCard({ test, onDoubleClick, onContextMenu }: Props) {
  const [copied, setCopied] = useState(false);

  async function copyLink(e: React.MouseEvent) {
    e.stopPropagation();
    if (!test.slug) return;
    await navigator.clipboard.writeText(`${window.location.origin}/t/${test.slug}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const status = STATUS_STYLES[test.showResults] ?? STATUS_STYLES.immediately;
  const headerGradient = colorFromName(test.name);

  return (
    <div
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      className="rounded-2xl overflow-hidden shadow-sm border border-white/60 cursor-pointer select-none hover:shadow-md active:scale-[0.98] transition-all duration-100 bg-white flex flex-col"
      style={{ width: 220 }}
    >
      {/* Colored header */}
      <div className="h-2 w-full" style={{ background: headerGradient }} />

      {/* Body */}
      <div className="p-4 flex flex-col gap-2 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-[14px] font-bold text-gray-800 leading-snug line-clamp-2 flex-1">{test.name}</h3>
          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0 ${status.className}`}>
            {status.label}
          </span>
        </div>

        {test.description ? (
          <p className="text-[12px] text-gray-400 leading-relaxed line-clamp-2">{test.description}</p>
        ) : (
          <p className="text-[12px] text-gray-300 italic">Tavsif yo'q</p>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-gray-100 px-4 py-2.5 flex items-center gap-3 text-[11px] text-gray-400">
        <span className="flex items-center gap-1">
          <Clock size={11} />
          {test.timeLimit ? `${test.timeLimit} daq` : '—'}
        </span>
        {test.oneByOne && <span title="Birin-ketin" className="font-medium">1×1</span>}
        {test.shuffleQuestions && (
          <span title="Savollar aralashtiriladi"><Shuffle size={11} /></span>
        )}
        {test.deadline && (
          <span className="flex items-center gap-1" title={new Date(test.deadline).toLocaleString()}>
            <Calendar size={11} />
            {new Date(test.deadline).toLocaleDateString('uz-UZ')}
          </span>
        )}
        {test.slug && (
          <button
            onClick={copyLink}
            className="ml-auto text-indigo-400 hover:text-indigo-600 transition-colors"
            title="Linkni nusxalash"
          >
            {copied ? <Check size={12} /> : <Link2 size={12} />}
          </button>
        )}
      </div>
    </div>
  );
}
