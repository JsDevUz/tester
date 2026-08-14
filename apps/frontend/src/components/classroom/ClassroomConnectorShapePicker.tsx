import { Circle, Square, Type, X } from "lucide-react";

interface ClassroomConnectorShapePickerProps {
  picker: { screenX: number; screenY: number };
  onClose: () => void;
  onPick: (tool: "rectangle" | "ellipse" | "text") => void;
}

export function ClassroomConnectorShapePicker({
  picker,
  onClose,
  onPick,
}: ClassroomConnectorShapePickerProps) {
  return (
    <>
      <div
        className="fixed inset-0 z-[199]"
        onClick={onClose}
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }}
      />
      <div
        className="fixed z-[200] flex flex-col gap-2 rounded-xl border border-gray-200 dark:border-zinc-700 bg-white/95 dark:bg-zinc-800/95 text-gray-900 dark:text-zinc-100 backdrop-blur-md p-3 shadow-2xl animate-in fade-in zoom-in-95 duration-150 select-none"
        style={{
          left: Math.max(
            16,
            Math.min(window.innerWidth - 240, picker.screenX - 100),
          ),
          top: Math.max(
            16,
            Math.min(window.innerHeight - 150, picker.screenY + 12),
          ),
        }}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-1 pb-1 border-b border-gray-100 dark:border-zinc-700">
          <span className="text-xs font-semibold text-gray-600 dark:text-zinc-300">
            Shakl tanlang
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 dark:text-zinc-400 hover:text-gray-600 dark:hover:text-zinc-200 rounded p-0.5 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-1.5 pt-1">
          <button
            type="button"
            onClick={() => onPick("rectangle")}
            className="flex flex-col items-center gap-1 p-2 rounded-xl border border-gray-200/80 dark:border-zinc-700 hover:border-indigo-500 dark:hover:border-indigo-400 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/50 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all group cursor-pointer"
            title="To'rtburchak"
          >
            <Square className="h-5 w-5 text-gray-700 dark:text-zinc-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400" />
            <span className="text-[11px] font-medium text-gray-800 dark:text-zinc-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
              To'rtburchak
            </span>
          </button>
          <button
            type="button"
            onClick={() => onPick("ellipse")}
            className="flex flex-col items-center gap-1 p-2 rounded-xl border border-gray-200/80 dark:border-zinc-700 hover:border-indigo-500 dark:hover:border-indigo-400 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/50 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all group cursor-pointer"
            title="Doira"
          >
            <Circle className="h-5 w-5 text-gray-700 dark:text-zinc-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400" />
            <span className="text-[11px] font-medium text-gray-800 dark:text-zinc-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
              Doira
            </span>
          </button>
          <button
            type="button"
            onClick={() => onPick("text")}
            className="flex flex-col items-center gap-1 p-2 rounded-xl border border-gray-200/80 dark:border-zinc-700 hover:border-indigo-500 dark:hover:border-indigo-400 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/50 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all group cursor-pointer"
            title="Matn"
          >
            <Type className="h-5 w-5 text-gray-700 dark:text-zinc-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400" />
            <span className="text-[11px] font-medium text-gray-800 dark:text-zinc-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
              Matn
            </span>
          </button>
        </div>
      </div>
    </>
  );
}
