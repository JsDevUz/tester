import { useRef } from 'react';
import {
  LayoutGrid, Film, Mic, MousePointer2, MessageSquare, ListChecks,
  Link2, FileStack, Paperclip, Image as ImageIcon, type LucideIcon,
} from 'lucide-react';

interface BlockPickerProps {
  onPickEditor: () => void;
  onPickFile: (type: 'video' | 'image' | 'file', file: File) => void;
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
];

const ROW_2: BlockItem[] = [
  { key: 'button', label: 'Tugma', icon: MousePointer2, disabled: true },
  { key: 'message', label: 'Xabar', icon: MessageSquare, disabled: true },
  { key: 'checklist', label: 'Chek-list', icon: ListChecks, disabled: true },
];

const ROW_3: BlockItem[] = [
  { key: 'divider', label: "Bo'lish belgisi", icon: Link2, disabled: true },
  { key: 'notion', label: 'Notion', icon: FileStack, disabled: true },
  { key: 'file', label: 'Fayl qo\'shish', icon: Paperclip },
];

export function BlockPicker({ onPickEditor, onPickFile }: BlockPickerProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingTypeRef = useRef<'video' | 'image' | 'file'>('file');

  function openFilePicker(type: 'video' | 'image' | 'file') {
    pendingTypeRef.current = type;
    if (fileInputRef.current) {
      fileInputRef.current.accept = FILE_ACCEPT[type];
      fileInputRef.current.click();
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) onPickFile(pendingTypeRef.current, file);
    e.target.value = '';
  }

  function handleClick(item: BlockItem) {
    if (item.disabled) return;
    if (item.key === 'editor') onPickEditor();
    else if (item.key === 'video' || item.key === 'file') openFilePicker(item.key);
  }

  // "Rasm" alohida ROW_1'ga mos kelmagani uchun uni Video yonida ko'rsatamiz
  const rows = [
    [...ROW_1, { key: 'image', label: 'Rasm', icon: ImageIcon } as BlockItem],
    ROW_2,
    ROW_3,
  ];

  return (
    <div>
      <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} />
      <p className="text-center text-xs text-gray-400 mb-3">Yangi blok qo'shish</p>
      <div className="flex flex-col gap-3">
        {rows.map((row, i) => (
          <div key={i} className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {row.map((item) => {
              const Icon = item.icon;
              const isImage = item.key === 'image';
              return (
                <button
                  key={item.key}
                  type="button"
                  disabled={item.disabled}
                  onClick={() => (isImage ? openFilePicker('image') : handleClick(item))}
                  className={`flex flex-col items-center gap-2 rounded-2xl px-4 py-5 text-sm font-medium transition-colors ${
                    item.disabled
                      ? 'cursor-not-allowed border border-gray-100 bg-gray-50 text-gray-300'
                      : 'border-2 border-gray-100 bg-white text-gray-600 hover:border-indigo-200 hover:bg-indigo-50/30'
                  }`}
                >
                  <Icon size={22} className={item.disabled ? 'text-gray-300' : 'text-indigo-400'} />
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
