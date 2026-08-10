import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Clock, Shuffle, Link2, Check, Settings2, Trash2, Pencil } from "lucide-react";
import type { StudentTest } from "../api/student-tests";

interface Props {
  test: StudentTest;
  onEdit: () => void;
  onSettings: () => void;
  onDelete: () => void;
}

export function StudentTestCard({ test, onEdit, onSettings, onDelete }: Props) {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);

  function handleStartTest() {
    if (test.slug) {
      navigate(`/t/${test.slug}`);
    }
  }

  async function copyLink(e: React.MouseEvent) {
    e.stopPropagation();
    if (!test.slug) return;
    await navigator.clipboard.writeText(`${window.location.origin}/t/${test.slug}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="student-responsive-card bg-white rounded-3xl overflow-hidden flex flex-col border border-gray-200/80 transition-all dark:bg-zinc-800 dark:border-zinc-700">
      {/* Header section — Clicking starts the test! */}
      <div
        onClick={handleStartTest}
        className="h-[100px] px-4 pt-4 pb-4 shrink-0 cursor-pointer hover:bg-gray-50/50 transition-colors"
      >
        <p className="text-[10px] text-gray-400 uppercase tracking-wide font-medium mb-1">Test</p>
        <p className="text-sm font-bold text-gray-800 leading-snug line-clamp-1 dark:text-zinc-100">{test.name}</p>
        <p className="min-h-[28px] text-[11px] text-gray-400 line-clamp-2 leading-snug mt-1 dark:text-zinc-400">{test.description || " "}</p>
      </div>

      {/* Action buttons bar */}
      <div className="h-[52px] bg-gray-900 px-4 grid grid-cols-3 items-center gap-2 shrink-0">
        <button type="button" onClick={onEdit} aria-label="Savollar" className="h-9 w-full inline-flex items-center justify-center rounded-xl text-gray-400 hover:bg-white/10 hover:text-white transition-colors">
          <Pencil size={17} />
        </button>
        <button type="button" onClick={onSettings} aria-label="Sozlamalar" className="h-9 w-full inline-flex items-center justify-center rounded-xl text-gray-400 hover:bg-white/10 hover:text-white transition-colors">
          <Settings2 size={17} />
        </button>
        <button type="button" onClick={onDelete} aria-label="O'chirish" className="h-9 w-full inline-flex items-center justify-center rounded-xl text-gray-400 hover:bg-white/10 hover:text-red-400 transition-colors">
          <Trash2 size={17} />
        </button>
      </div>

      {/* Details section */}
      <div className="px-4 py-3 flex flex-1 flex-col gap-2 min-h-0">
        <div className="flex h-4 items-center gap-2 text-xs text-gray-600 dark:text-zinc-300">
          <Clock size={13} className="text-gray-400 shrink-0" />
          <span className="truncate">{test.timeLimit ? `${test.timeLimit} daqiqa` : "Vaqt cheklanmagan"}</span>
        </div>
        <div className="flex h-4 items-center gap-2 text-xs text-gray-600 dark:text-zinc-300">
          <Shuffle size={13} className="text-gray-400 shrink-0" />
          <span className="truncate">{test.shuffleQuestions ? "Savollar aralashtiriladi" : "Savollar tartibli"}</span>
        </div>
        {test.slug ? (
          <button onClick={copyLink} className="flex h-4 items-center gap-2 text-xs text-gray-600 hover:text-gray-900 transition-colors text-left dark:text-zinc-300 dark:hover:text-white">
            {copied ? <Check size={13} className="shrink-0 text-emerald-500" /> : <Link2 size={13} className="shrink-0" />}
            <span className="truncate">{copied ? "Nusxalandi!" : "Havola nusxalash"}</span>
          </button>
        ) : (
          <div className="flex h-4 items-center gap-2 text-xs text-gray-300 dark:text-zinc-600">
            <Link2 size={13} className="shrink-0" />
            <span className="truncate">Havola yo'q</span>
          </div>
        )}
      </div>
    </div>
  );
}
