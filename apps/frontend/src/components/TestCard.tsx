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
  Pin,
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
  onPin: () => void;
  hasPin: boolean;
}

const actionButtonClass =
  "group relative h-9 w-full inline-flex items-center justify-center rounded-xl text-gray-800 dark:text-zinc-200 hover:bg-black/10 dark:hover:bg-white/10 hover:text-black dark:hover:text-white transition-colors focus:outline-none focus-visible:outline-none focus-visible:ring-0 cursor-pointer";
const actionIconSize = 17;

function ActionButton({
  label,
  icon: Icon,
  onClick,
  danger,
  className,
}: {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  danger?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`${actionButtonClass} ${danger ? "hover:text-red-600 dark:hover:text-red-400 hover:bg-red-500/10 dark:hover:bg-red-500/20" : ""} ${className ?? ""}`}
    >
      <Icon size={actionIconSize} />
      <span className="test-card-action-tooltip pointer-events-none absolute left-1/2 top-full z-50 mt-2 -translate-x-1/2 translate-y-1 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[11px] font-semibold opacity-0 shadow-lg shadow-gray-900/20 transition-all duration-150 group-hover:translate-y-0 group-hover:opacity-100">
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
  onPin,
  hasPin,
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
    <div className="glass-card rounded-3xl overflow-hidden flex flex-col transition-all hover:shadow-lg">
      {/* Header */}
      <div className="h-[100px] px-4 pt-4 pb-4 shrink-0">
        <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-semibold mb-1">
          Test
        </p>
        <p className="text-sm font-bold text-[var(--text-primary)] leading-snug line-clamp-1">
          {test.name}
        </p>
        <p className="min-h-[28px] text-[11px] text-[var(--text-muted)] line-clamp-2 leading-snug mt-1">
          {test.description || "\u00A0"}
        </p>
      </div>

      {/* Action bar */}
      <div className="h-[52px] bg-black/10 dark:bg-white/10 px-4 grid grid-cols-6 items-center gap-2 shrink-0 border-y border-black/5 dark:border-white/5">
        <ActionButton label="Jonli musobaqa" icon={Radio} onClick={onLive} />
        <ActionButton
          label={hasPin ? "Tayinlangan (tahrirlash)" : "Guruhga tayinlash"}
          icon={Pin}
          onClick={onPin}
          className={hasPin ? "text-amber-500 dark:text-amber-400 hover:text-amber-400" : undefined}
        />
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

      {/* Info list */}
      <div className="px-4 py-3.5 flex flex-1 flex-col gap-2 min-h-0">
        <div className="flex h-4 items-center gap-2 text-xs text-[var(--text-secondary)]">
          <Clock size={13} className="text-[var(--text-muted)] shrink-0" />
          <span className="truncate">
            {test.timeLimit ? `${test.timeLimit} daqiqa` : "Vaqt cheklanmagan"}
          </span>
        </div>
        <div className="flex h-4 items-center gap-2 text-xs text-[var(--text-secondary)]">
          <Shuffle size={13} className="text-[var(--text-muted)] shrink-0" />
          <span className="truncate">
            {test.shuffleQuestions
              ? "Savollar aralashtiriladi"
              : "Savollar tartibli"}
          </span>
        </div>
        <div
          className={`flex h-4 items-center gap-2 text-xs ${test.requireAuth ? "text-[var(--text-secondary)]" : "text-[var(--text-muted)]"}`}
        >
          <History size={13} className="text-[var(--text-muted)] shrink-0" />
          <span className="truncate">
            {test.requireAuth ? "Tarixga saqlanadi" : "Tarixga saqlanmaydi"}
          </span>
        </div>
        {test.deadline ? (
          <div className="flex h-4 items-center gap-2 text-xs text-[var(--text-secondary)]">
            <Calendar size={13} className="text-[var(--text-muted)] shrink-0" />
            <span className="truncate">{formatDate(test.deadline)}</span>
          </div>
        ) : (
          <div className="flex h-4 items-center gap-2 text-xs text-[var(--text-muted)]">
            <Calendar size={13} className="shrink-0" />
            <span className="truncate">Muddat belgilanmagan</span>
          </div>
        )}
        {test.slug ? (
          <button
            type="button"
            onClick={copyLink}
            className="flex h-4 items-center gap-2 text-xs text-[var(--text-secondary)] hover:text-indigo-600 dark:hover:text-white transition-colors text-left cursor-pointer"
          >
            {copied ? (
              <Check size={13} className="shrink-0 text-emerald-500" />
            ) : (
              <Link2 size={13} className="shrink-0 text-[var(--text-muted)]" />
            )}
            <span className="truncate">
              {copied ? "Nusxalandi!" : "Havola nusxalash"}
            </span>
          </button>
        ) : (
          <div className="flex h-4 items-center gap-2 text-xs text-[var(--text-muted)]">
            <Link2 size={13} className="shrink-0" />
            <span className="truncate">Havola yo'q</span>
          </div>
        )}
      </div>
    </div>
  );
}
