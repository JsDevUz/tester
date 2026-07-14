import { ClipboardList, Image as ImageIcon, MessagesSquare } from 'lucide-react';
import type { PracticeBlockType } from '../../stores/courseStore';

interface PracticeBlockPickerProps {
  onPickType: (type: PracticeBlockType) => void;
  disabled?: boolean;
  limitText?: string;
}

const TYPES: Array<{ type: PracticeBlockType; label: string; icon: typeof ClipboardList }> = [
  { type: 'test', label: 'Test', icon: ClipboardList },
  { type: 'image', label: 'Rasm', icon: ImageIcon },
  { type: 'oral', label: 'Jonli savol-javob', icon: MessagesSquare },
];

export function PracticeBlockPicker({ onPickType, disabled = false, limitText }: PracticeBlockPickerProps) {
  return (
    <div>
      <p className="mb-3 text-center text-xs text-gray-400">
        {disabled ? (limitText ?? "Blok limiti to'ldi") : "Yangi blok qo'shish"}
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
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
                  ? 'cursor-not-allowed bg-gray-50 text-gray-300'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Icon size={22} className={disabled ? 'text-gray-300' : 'text-gray-700'} />
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
