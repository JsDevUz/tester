import { ClipboardList, Image as ImageIcon, Paperclip, Mic } from 'lucide-react';
import type { PracticeBlockType } from '../../stores/courseStore';

interface PracticeBlockPickerProps {
  onPickType: (type: PracticeBlockType) => void;
  disabled?: boolean;
  limitText?: string;
}

const TYPES: Array<{ type: PracticeBlockType; label: string; icon: typeof ClipboardList }> = [
  { type: 'test', label: 'Test', icon: ClipboardList },
  { type: 'image', label: 'Rasm', icon: ImageIcon },
  { type: 'file', label: 'Fayl', icon: Paperclip },
  { type: 'audio', label: 'Audio', icon: Mic },
];

export function PracticeBlockPicker({ onPickType, disabled = false, limitText }: PracticeBlockPickerProps) {
  return (
    <div>
      <p className="mb-3 text-center text-xs text-gray-400">
        {disabled ? (limitText ?? "Blok limiti to'ldi") : "Yangi blok qo'shish"}
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {TYPES.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.type}
              type="button"
              disabled={disabled}
              onClick={() => onPickType(item.type)}
              className={`flex flex-col items-center gap-2 rounded-2xl px-4 py-5 text-sm font-medium transition-colors ${
                disabled
                  ? 'cursor-not-allowed border border-gray-100 bg-gray-50 text-gray-300'
                  : 'border-2 border-gray-100 bg-white text-gray-600 hover:border-indigo-200 hover:bg-indigo-50/30'
              }`}
            >
              <Icon size={22} className={disabled ? 'text-gray-300' : 'text-indigo-400'} />
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
