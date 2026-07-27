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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-96 rounded-3xl bg-white p-6">
        <p className="mb-1 text-sm font-semibold text-gray-800">Yozib olish</p>
        <p className="mb-5 text-sm text-gray-400">
          Chizma holati har doim avtomatik saqlanadi. Ovoz yozish uchun tanlang:
        </p>
        <div className="flex flex-col gap-2">
          {OPTIONS.map(({ mode, icon: Icon, label, description }) => (
            <button
              key={mode}
              type="button"
              onClick={() => onSelect(mode)}
              className="flex items-start gap-3 rounded-2xl border border-gray-100 px-4 py-3 text-left transition-colors hover:bg-gray-50"
            >
              <Icon size={18} className="mt-0.5 shrink-0 text-gray-400" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-700">{label}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-gray-400">
                  {description}
                </p>
              </div>
            </button>
          ))}
        </div>
        <div className="mt-5 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700"
          >
            Bekor qilish
          </button>
        </div>
      </div>
    </div>
  );
}
