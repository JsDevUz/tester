import type { LucideIcon } from "lucide-react";

export function SummaryCard({
  icon: Icon,
  title,
  value,
  trend,
  tone,
  highlighted = false,
}: {
  icon: LucideIcon;
  title: string;
  value: string;
  trend: string;
  tone: "orange" | "red" | "indigo" | "amber" | "neutral";
  highlighted?: boolean;
}) {
  const iconClass = {
    orange: highlighted ? "bg-white/20 text-white" : "bg-orange-500/10 text-orange-500",
    red: "bg-red-500/10 text-red-500",
    indigo: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
    amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    neutral: "bg-black/5 dark:bg-white/10 text-[var(--text-muted)]",
  }[tone];

  const trendClass =
    tone === "red"
      ? highlighted
        ? "bg-white/20 text-white"
        : "bg-red-500/10 text-red-600 dark:text-red-400"
      : tone === "amber"
        ? highlighted
          ? "bg-white/20 text-white"
          : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
        : highlighted
          ? "bg-white/20 text-white"
          : tone === "neutral"
            ? "bg-black/5 dark:bg-white/10 text-[var(--text-muted)]"
            : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";

  return (
    <div
      className={`min-w-40 flex-1 rounded-2xl p-3 transition-colors ${
        highlighted
          ? "bg-indigo-600 text-white shadow-md"
          : "bg-[var(--surface-bg)] text-[var(--text-primary)] shadow-xs"
      }`}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <p
          className={`text-xs font-bold tracking-tight ${
            highlighted ? "text-white/90" : "text-[var(--text-secondary)]"
          }`}
        >
          {title}
        </p>
        <div
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-xl ${iconClass}`}
        >
          <Icon size={15} />
        </div>
      </div>
      <p
        className={`text-xl font-bold tracking-tight ${
          highlighted ? "text-white" : "text-[var(--text-primary)]"
        }`}
      >
        {value}
      </p>
      <div className="mt-2.5 flex items-center gap-1.5">
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${trendClass}`}
        >
          {trend}
        </span>
        <span
          className={`text-[10px] font-medium ${
            highlighted ? "text-white/75" : "text-[var(--text-muted)]"
          }`}
        >
          Shu oy
        </span>
      </div>
    </div>
  );
}
