import { Moon, Sun } from "lucide-react";

/** Classroom header uchun ixcham light/dark almashtirgich. */
export function ClassroomThemeToggle({
  theme,
  onToggle,
}: {
  theme: "light" | "dark";
  onToggle: () => void;
}) {
  const dark = theme === "dark";
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={dark ? "Light theme" : "Dark theme"}
      title={dark ? "Light theme" : "Dark theme"}
      className={`flex items-center justify-center rounded-full border px-2 py-1.5 shadow-md transition-colors ${dark ? "border-indigo-500/40 bg-indigo-600 text-white hover:bg-indigo-700" : "border-gray-100 bg-white text-gray-500 hover:bg-gray-100"}`}
    >
      {dark ? <Moon size={14} /> : <Sun size={14} />}
    </button>
  );
}
