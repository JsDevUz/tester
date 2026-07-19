import { useRef, useState } from 'react';
import {
  LayoutGrid, Film, MousePointer2, Paperclip, type LucideIcon,
  // Radio, — jonli dars blok item'i bilan birga vaqtincha o'chirilgan
} from 'lucide-react';
import { MediaLibraryModal } from '../MediaLibraryModal';

interface BlockPickerProps {
  onPickEditor: () => void;
  onPickFile: (type: 'video' | 'image' | 'file', file: File) => void;
  onPickFileFromLibrary: (url: string, fileName: string) => void;
  onPickLiveClass: () => void;
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
  // Vaqtincha o'chirilgan — jonli dars blokini qo'shish qaytadan yoqilguncha.
  // { key: 'live_class', label: 'Jonli dars', icon: Radio },
  { key: 'button', label: 'Tugma', icon: MousePointer2, disabled: true },
  { key: 'file', label: 'Fayl qo\'shish', icon: Paperclip },
];

export function BlockPicker({ onPickEditor, onPickFile, onPickFileFromLibrary, onPickLiveClass, disabled = false, limitText }: BlockPickerProps) {
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
      <p className="text-center text-xs text-gray-400 mb-3">
        {disabled ? (limitText ?? "Blok limiti to'ldi") : "Yangi blok qo'shish"}
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {BLOCK_ITEMS.map((item) => {
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
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              <span
                className={`flex h-10 w-10 items-center justify-center rounded-xl transition-colors ${
                  isDisabled
                    ? 'bg-gray-100 text-gray-300'
                    : 'bg-gray-100 text-gray-700 group-hover:bg-gray-200'
                }`}
              >
                <Icon size={20} />
              </span>
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
