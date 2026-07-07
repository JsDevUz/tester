import { useState } from "react";
import {
  Clock,
  Shuffle,
  Calendar,
  Link2,
  Check,
  BarChart2,
  Settings2,
  Trash2,
  Pencil,
  Radio,
  History,
  type LucideIcon,
} from "lucide-react";
import type { Test } from "../api/tests";
import { formatDate } from "../utils/date";

interface Props {
  test: Test;
  onEdit: () => void;
  onSettings: () => void;
  onDelete: () => void;
  onResults: () => void;
  onLive: () => void;
}

const actionButtonClass =
  "group relative h-9 w-full inline-flex items-center justify-center rounded-xl text-gray-400 hover:bg-white/10 hover:text-white transition-colors focus:outline-none focus-visible:outline-none focus-visible:ring-0";
const actionIconSize = 17;

function ActionButton({
  label,
  icon: Icon,
  onClick,
  danger,
}: {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`${actionButtonClass} ${danger ? "hover:text-red-400" : ""}`}
    >
      <Icon size={actionIconSize} />
      <span className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 -translate-x-1/2 translate-y-1 whitespace-nowrap rounded-lg bg-gray-800 px-2.5 py-1.5 text-[11px] font-semibold text-white opacity-0 shadow-lg shadow-gray-900/20 transition-all duration-150 group-hover:translate-y-0 group-hover:opacity-100">
        {label}
      </span>
    </button>
  );
}

export function TestCard({
  test,
  onEdit,
  onSettings,
  onDelete,
  onResults,
  onLive,
}: Props) {
  const [copied, setCopied] = useState(false);

  async function copyLink(e: React.MouseEvent) {
    e.stopPropagation();
    if (!test.slug) return;
    await navigator.clipboard.writeText(
      `${window.location.origin}/t/${test.slug}`,
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="bg-white rounded-3xl shadow-smoverflow-hidden flex flex-col">
      {/* Header */}
      <div className="h-[100px] px-4 pt-4 pb-4 shrink-0">
        <p className="text-[10px] text-gray-400 uppercase tracking-wide font-medium mb-1">
          Test
        </p>
        <p className="text-sm font-bold text-gray-800 leading-snug line-clamp-1">
          {test.name}
        </p>
        <p className="min-h-[28px] text-[11px] text-gray-400 line-clamp-2 leading-snug mt-1">
          {test.description || "\u00A0"}
        </p>
      </div>

      {/* Dark action bar */}
      <div className="h-[52px] bg-gray-900 px-4 grid grid-cols-5 items-center gap-2 shrink-0">
        <ActionButton label="Jonli musobaqa" icon={Radio} onClick={onLive} />
        <ActionButton label="Natijalar" icon={BarChart2} onClick={onResults} />
        <ActionButton label="Savollar" icon={Pencil} onClick={onEdit} />
        <ActionButton
          label="Sozlamalar"
          icon={Settings2}
          onClick={onSettings}
        />
        <ActionButton
          label="O'chirish"
          icon={Trash2}
          onClick={onDelete}
          danger
        />
      </div>

      {/* Info list — like feature list in the reference */}
      <div className="px-4 py-3 flex flex-1 flex-col gap-2 min-h-0">
        <div className="flex h-4 items-center gap-2 text-xs text-gray-600">
          <Clock size={13} className="text-gray-400 shrink-0" />
          <span className="truncate">
            {test.timeLimit ? `${test.timeLimit} daqiqa` : "Vaqt cheklanmagan"}
          </span>
        </div>
        <div className="flex h-4 items-center gap-2 text-xs text-gray-600">
          <Shuffle size={13} className="text-gray-400 shrink-0" />
          <span className="truncate">
            {test.shuffleQuestions
              ? "Savollar aralashtiriladi"
              : "Savollar tartibli"}
          </span>
        </div>
        <div
          className={`flex h-4 items-center gap-2 text-xs ${test.requireAuth ? "text-gray-600" : "text-gray-400"}`}
        >
          <History size={13} className="text-gray-400 shrink-0" />
          <span className="truncate">
            {test.requireAuth ? "Tarixga saqlanadi" : "Tarixga saqlanmaydi"}
          </span>
        </div>
        {test.deadline ? (
          <div className="flex h-4 items-center gap-2 text-xs text-gray-600">
            <Calendar size={13} className="text-gray-400 shrink-0" />
            <span className="truncate">{formatDate(test.deadline)}</span>
          </div>
        ) : (
          <div className="flex h-4 items-center gap-2 text-xs text-gray-400">
            <Calendar size={13} className="shrink-0" />
            <span className="truncate">Muddat belgilanmagan</span>
          </div>
        )}
        {test.slug ? (
          <button
            onClick={copyLink}
            className="flex h-4 items-center gap-2 text-xs text-indigo-500 hover:text-indigo-700 transition-colors text-left"
          >
            {copied ? (
              <Check size={13} className="shrink-0" />
            ) : (
              <Link2 size={13} className="shrink-0" />
            )}
            <span className="truncate">
              {copied ? "Nusxalandi!" : "Havola nusxalash"}
            </span>
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
