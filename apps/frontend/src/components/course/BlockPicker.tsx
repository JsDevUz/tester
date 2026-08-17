import { useRef, useState } from 'react';
import {
  LayoutGrid, Film, MousePointer2, Paperclip, Radio, MessageSquareText, type LucideIcon,
} from 'lucide-react';
import { MediaLibraryModal } from '../MediaLibraryModal';

interface BlockPickerProps {
  onPickEditor: () => void;
  onPickFile: (type: 'video' | 'image' | 'file', file: File) => void;
  onPickFileFromLibrary: (url: string, fileName: string) => void;
  onPickLiveClass: () => void;
  onPickButton: () => void;
  onPickMessage: () => void;
  disabled?: boolean;
  limitText?: string;
}

const FILE_ACCEPT: Record<'video' | 'image' | 'file', string> = {
  video: 'video/*',
  image: 'image/*',
  file: '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

interface BlockItem {
  key: string;
  label: string;
  icon: LucideIcon;
  disabled?: boolean;
}

const BLOCK_ITEMS: BlockItem[] = [
  { key: 'editor', label: 'Tahrirchi', icon: LayoutGrid },
  { key: 'video', label: 'Video', icon: Film },
  { key: 'live_class', label: 'Jonli dars', icon: Radio },
  { key: 'button', label: 'Tugma', icon: MousePointer2 },
  { key: 'message', label: 'Xabar', icon: MessageSquareText },
  { key: 'file', label: 'Fayl qo\'shish', icon: Paperclip },
];

export function BlockPicker({ onPickEditor, onPickFile, onPickFileFromLibrary, onPickLiveClass, onPickButton, onPickMessage, disabled = false, limitText }: BlockPickerProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingTypeRef = useRef<'video' | 'image' | 'file'>('file');
  const [libraryOpen, setLibraryOpen] = useState(false);

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
    else if (item.key === 'video') openFilePicker(item.key);
    else if (item.key === 'file') setLibraryOpen(true);
    else if (item.key === 'live_class') onPickLiveClass();
    else if (item.key === 'button') onPickButton();
    else if (item.key === 'message') onPickMessage();
  }

  return (
    <div>
      <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} />
      {libraryOpen && (
        <MediaLibraryModal
          type="file"
          folder="lessons"
          onSelect={(url) => {
            const fileName = url.split('/').pop() || 'fayl';
            onPickFileFromLibrary(url, fileName);
            setLibraryOpen(false);
          }}
          onClose={() => setLibraryOpen(false)}
        />
      )}
      <p className="text-center text-[11px] font-semibold text-[var(--text-muted)] mb-3.5">
        {disabled ? (limitText ?? "Blok limiti to'ldi") : "Yangi blok qo'shish"}
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {BLOCK_ITEMS.map((item) => {
          const Icon = item.icon;
          const isDisabled = disabled || item.disabled;
          return (
            <button
              key={item.key}
              type="button"
              disabled={isDisabled}
              onClick={() => handleClick(item)}
              className={`group flex flex-col items-center gap-2.5 rounded-2xl p-4 text-xs font-bold transition-all ${
                isDisabled
                  ? 'cursor-not-allowed opacity-30 bg-[var(--card-bg)]'
                  : 'bg-[var(--card-bg)] hover:bg-[var(--card-hover)] text-[var(--text-primary)] hover:shadow-xs active:scale-[0.98] cursor-pointer'
              }`}
            >
              <span
                className={`flex h-11 w-11 items-center justify-center rounded-xl transition-transform ${
                  isDisabled
                    ? 'bg-[var(--card-hover)] text-[var(--text-muted)]'
                    : 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 group-hover:scale-105'
                }`}
              >
                <Icon size={18} />
              </span>
              <span className="truncate max-w-full">{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
