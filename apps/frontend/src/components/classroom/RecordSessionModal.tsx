import { Mic, Video } from "lucide-react";
import type { ClassRecordingMode } from "../../api/classroom";

interface Option {
  mode: ClassRecordingMode;
  icon: typeof Video;
  label: string;
  description: string;
}

const OPTIONS: Option[] = [
  {
    mode: "full",
    icon: Video,
    label: "To'liq yozib olish",
    description:
      "Butun darsni ovoz bilan yozadi — keyinroq boshidan oxirigacha, chizmalar bosqichma-bosqich qayta ijro etilib, tomosha qilish mumkin.",
  },
  {
    mode: "boardAudio",
    icon: Mic,
    label: "Faqat chizma (ovozli)",
    description:
      "Dars ovozi yoziladi, lekin faqat sahifaning ENG OXIRGI holati saqlanadi — bosqichma-bosqich qayta ijro bo'lmaydi, faqat yakuniy chizma + ovoz saqlanadi.",
  },
];

interface Props {
  onSelect: (mode: ClassRecordingMode) => void;
  onClose: () => void;
}

export function RecordSessionModal({ onSelect, onClose }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/10 dark:bg-black/30 p-4 animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="glass-card w-full max-w-sm rounded-3xl p-6 shadow-2xl text-[var(--text-primary)] animate-in zoom-in-95 duration-150">
        <p className="mb-1 text-base font-bold text-[var(--text-primary)] tracking-tight">Yozib olish</p>
        <p className="mb-4 text-xs text-[var(--text-muted)] leading-relaxed">
          Chizma holati har doim avtomatik saqlanadi. Ovoz yozish uchun tanlang:
        </p>
        <div className="flex flex-col gap-2">
          {OPTIONS.map(({ mode, icon: Icon, label, description }) => (
            <button
              key={mode}
              type="button"
              onClick={() => onSelect(mode)}
              className="flex items-start gap-3 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/10 px-4 py-3 text-left transition-colors hover:bg-black/10 dark:hover:bg-white/10 cursor-pointer"
            >
              <Icon size={18} className="mt-0.5 shrink-0 text-indigo-500" />
              <div className="min-w-0">
                <p className="text-xs font-bold text-[var(--text-primary)]">{label}</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--text-muted)] font-medium">
                  {description}
                </p>
              </div>
            </button>
          ))}
        </div>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--card-hover)] transition-colors cursor-pointer"
          >
            Bekor qilish
          </button>
        </div>
      </div>
    </div>
  );
}
