import { useState } from "react";
import { Clock, Shuffle, Link2, Check, Settings2, Trash2, Pencil } from "lucide-react";
import type { StudentTest } from "../api/student-tests";

interface Props {
  test: StudentTest;
  onEdit: () => void;
  onSettings: () => void;
  onDelete: () => void;
}

export function StudentTestCard({ test, onEdit, onSettings, onDelete }: Props) {
  const [copied, setCopied] = useState(false);

  async function copyLink(e: React.MouseEvent) {
    e.stopPropagation();
    if (!test.slug) return;
    await navigator.clipboard.writeText(`${window.location.origin}/t/${test.slug}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="bg-white rounded-3xl overflow-hidden flex flex-col">
      <div className="h-[100px] px-4 pt-4 pb-4 shrink-0">
        <p className="text-[10px] text-gray-400 uppercase tracking-wide font-medium mb-1">Test</p>
        <p className="text-sm font-bold text-gray-800 leading-snug line-clamp-1">{test.name}</p>
        <p className="min-h-[28px] text-[11px] text-gray-400 line-clamp-2 leading-snug mt-1">{test.description || " "}</p>
      </div>

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

      <div className="px-4 py-3 flex flex-1 flex-col gap-2 min-h-0">
        <div className="flex h-4 items-center gap-2 text-xs text-gray-600">
          <Clock size={13} className="text-gray-400 shrink-0" />
          <span className="truncate">{test.timeLimit ? `${test.timeLimit} daqiqa` : "Vaqt cheklanmagan"}</span>
        </div>
        <div className="flex h-4 items-center gap-2 text-xs text-gray-600">
          <Shuffle size={13} className="text-gray-400 shrink-0" />
          <span className="truncate">{test.shuffleQuestions ? "Savollar aralashtiriladi" : "Savollar tartibli"}</span>
        </div>
        {test.slug ? (
          <button onClick={copyLink} className="flex h-4 items-center gap-2 text-xs text-gray-600 hover:text-gray-900 transition-colors text-left">
            {copied ? <Check size={13} className="shrink-0" /> : <Link2 size={13} className="shrink-0" />}
            <span className="truncate">{copied ? "Nusxalandi!" : "Havola nusxalash"}</span>
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
