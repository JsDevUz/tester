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
    orange: highlighted ? "bg-white/20 text-white" : "bg-orange-50 text-orange-500",
    red: "bg-red-50 text-red-500",
    indigo: "bg-gray-100 text-gray-600",
    amber: "bg-amber-50 text-amber-600",
    neutral: "bg-gray-100 text-gray-500",
  }[tone];
  const trendClass =
    tone === "red"
      ? highlighted
        ? "bg-white/20 text-white"
        : "bg-red-50 text-red-500"
      : tone === "amber"
        ? highlighted
          ? "bg-white/20 text-white"
          : "bg-amber-50 text-amber-600"
        : highlighted
          ? "bg-white/20 text-white"
          : tone === "neutral"
            ? "bg-gray-100 text-gray-500"
            : "bg-green-50 text-green-600";

  return (
    <div
      className={`min-w-40 flex-1 rounded-2xl p-2.5 ${
        highlighted
          ? "bg-gray-900 text-white"
          : "bg-white text-gray-900"
      }`}
    >
      <div className="mb-4 flex items-center justify-between gap-2">
        <p
          className={`text-xs font-semibold ${
            highlighted ? "text-white" : "text-gray-700"
          }`}
        >
          {title}
        </p>
        <div
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${iconClass}`}
        >
          <Icon size={14} />
        </div>
      </div>
      <p
        className={`text-xl font-semibold ${
          highlighted ? "text-white" : "text-gray-900"
        }`}
      >
        {value}
      </p>
      <div className="mt-2.5 flex items-center gap-1.5">
        <span
          className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${trendClass}`}
        >
          {trend}
        </span>
        <span
          className={`text-[10px] ${
            highlighted ? "text-white/80" : "text-gray-400"
          }`}
        >
          Shu oy
        </span>
      </div>
    </div>
  );
}
