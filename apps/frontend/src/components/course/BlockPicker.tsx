import { useRef } from 'react';
import {
  LayoutGrid, Film, Mic, MousePointer2, MessageSquare, ListChecks,
  Link2, FileStack, Paperclip, Code2, type LucideIcon,
} from 'lucide-react';

interface BlockPickerProps {
  onPickEditor: () => void;
  onPickFile: (type: 'video' | 'image' | 'file', file: File) => void;
  disabled?: boolean;
  limitText?: string;
}

const FILE_ACCEPT: Record<'video' | 'image' | 'file', string> = {
  video: 'video/*',
  image: 'image/*',
  file: '*/*',
};

interface BlockItem {
  key: string;
  label: string;
  icon: LucideIcon;
  disabled?: boolean;
}

const ROW_1: BlockItem[] = [
  { key: 'editor', label: 'Tahrirchi', icon: LayoutGrid },
  { key: 'video', label: 'Video', icon: Film },
  { key: 'audio', label: 'Audio', icon: Mic, disabled: true },
  { key: 'embed', label: 'Embed', icon: Code2, disabled: true },
];

const ROW_2: BlockItem[] = [
  { key: 'button', label: 'Tugma', icon: MousePointer2, disabled: true },
  { key: 'message', label: 'Xabar', icon: MessageSquare, disabled: true },
  { key: 'checklist', label: 'Chek-list', icon: ListChecks, disabled: true },
  { key: 'divider', label: "Bo'lish belgisi", icon: Link2, disabled: true },
];

const ROW_3: BlockItem[] = [
  { key: 'notion', label: 'Notion', icon: FileStack, disabled: true },
  { key: 'file', label: 'Fayl qo\'shish', icon: Paperclip },
];

export function BlockPicker({ onPickEditor, onPickFile, disabled = false, limitText }: BlockPickerProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingTypeRef = useRef<'video' | 'image' | 'file'>('file');

  function openFilePicker(type: 'video' | 'image' | 'file') {
    if (disabled) return;
    pendingTypeRef.current = type;
    if (fileInputRef.current) {
      fileInputRef.current.accept = FILE_ACCEPT[type];
      fileInputRef.current.click();
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (disabled) {
      e.target.value = '';
      return;
    }
    const file = e.target.files?.[0];
    if (file) onPickFile(pendingTypeRef.current, file);
    e.target.value = '';
  }

  function handleClick(item: BlockItem) {
    if (disabled || item.disabled) return;
    if (item.key === 'editor') onPickEditor();
    else if (item.key === 'video' || item.key === 'file') openFilePicker(item.key);
  }

  const rows = [ROW_1, ROW_2, ROW_3];

  return (
    <div>
      <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} />
      <p className="text-center text-xs text-gray-400 mb-3">
        {disabled ? (limitText ?? "Blok limiti to'ldi") : "Yangi blok qo'shish"}
      </p>
      <div className="flex flex-col gap-3">
        {rows.map((row, i) => (
          <div key={i} className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {row.map((item) => {
              const Icon = item.icon;
              const isDisabled = disabled || item.disabled;
              return (
                <button
                  key={item.key}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => handleClick(item)}
                  className={`group flex flex-col items-center gap-2.5 rounded-2xl px-4 py-5 text-sm font-medium transition-all duration-200 ${
                    isDisabled
                      ? 'cursor-not-allowed bg-gray-50/60 text-gray-300'
                      : 'bg-white text-gray-600 hover:bg-indigo-50/30'
                  }`}
                >
                  <span
                    className={`flex h-10 w-10 items-center justify-center rounded-xl transition-colors ${
                      isDisabled
                        ? 'bg-gray-100 text-gray-300'
                        : 'bg-indigo-50 text-indigo-500 group-hover:bg-indigo-100'
                    }`}
                  >
                    <Icon size={20} />
                  </span>
                  {item.label}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
