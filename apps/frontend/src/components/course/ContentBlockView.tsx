import {
  Film, Image as ImageIcon, Paperclip, LayoutGrid, ChevronUp, ChevronDown,
  X, Link2, Plus, ArrowUp, ArrowDown,
} from 'lucide-react';
import type { ContentBlock } from '../../stores/courseStore';
import { EditorBlock } from './EditorBlock';

interface ContentBlockViewProps {
  index: number;
  isFirst: boolean;
  isLast: boolean;
  block: ContentBlock;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onChangeHtml: (html: string) => void;
  onChangeEmbedUrl: (embedUrl: string) => void;
  onChangeLabel: (label: string) => void;
  onPickFile: (file: File) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

const TYPE_META: Record<ContentBlock['type'], { label: string; icon: typeof Film }> = {
  editor: { label: 'Tahrirchi', icon: LayoutGrid },
  video: { label: 'Video', icon: Film },
  image: { label: 'Rasm', icon: ImageIcon },
  file: { label: 'Fayl', icon: Paperclip },
};

export function ContentBlockView({
  index, isFirst, isLast, block, collapsed, onToggleCollapse, onChangeHtml, onChangeEmbedUrl, onChangeLabel,
  onPickFile, onRemove, onMoveUp, onMoveDown,
}: ContentBlockViewProps) {
  const meta = TYPE_META[block.type];
  const Icon = meta.icon;

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) onPickFile(file);
    e.target.value = '';
  }

  const accept = block.type === 'video' ? 'video/*' : block.type === 'image' ? 'image/*' : '*/*';

  return (
    <div className="rounded-2xl border-2 border-gray-100 bg-white">
      <div className="flex items-center gap-2.5 px-4 py-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-500">
          <Icon size={15} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-gray-800">Blok №{index + 1}</p>
          <p className="text-xs text-gray-400">{meta.label}</p>
        </div>
        <button
          type="button"
          onClick={onMoveUp}
          disabled={isFirst}
          title="Yuqoriga surish"
          className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ArrowUp size={15} />
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={isLast}
          title="Pastga surish"
          className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ArrowDown size={15} />
        </button>
        <button
          type="button"
          onClick={onToggleCollapse}
          className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-600"
        >
          {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </button>
        <button
          type="button"
          onClick={onRemove}
          title="Blokni o'chirish"
          className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
        >
          <X size={16} />
        </button>
      </div>

      {!collapsed && (
        <div className="border-t border-gray-100 px-4 py-4">
          {block.type === 'editor' && (
            <div className="flex flex-col gap-3">
              <div>
                <p className="mb-1.5 text-sm text-gray-500">Blok sarlavhasi</p>
                <input
                  value={block.label ?? ''}
                  onChange={(e) => onChangeLabel(e.target.value)}
                  placeholder="Sarlavhani kiriting"
                  className="w-full rounded-xl border-2 border-gray-100 bg-gray-50 px-4 py-2.5 text-sm outline-none focus:border-indigo-400"
                />
              </div>
              <EditorBlock html={block.html ?? ''} onChange={onChangeHtml} />
            </div>
          )}

          {(block.type === 'video' || block.type === 'image' || block.type === 'file') && (
            <div className="flex flex-col gap-3">
              {block.type === 'video' && (
                <div>
                  <p className="mb-1.5 text-sm text-gray-500">Videoni yuklang yoki havolani ko'rsating</p>
                  <div className="relative">
                    <Link2 size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-300" />
                    <input
                      value={block.embedUrl ?? ''}
                      onChange={(e) => onChangeEmbedUrl(e.target.value)}
                      placeholder="Yoki youtube havolasi"
                      className="w-full rounded-xl border-2 border-gray-100 bg-gray-50 py-2.5 pl-9 pr-4 text-sm outline-none focus:border-indigo-400"
                    />
                  </div>
                </div>
              )}

              {!block.embedUrl && (
                <label
                  className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 transition-colors hover:border-indigo-200 hover:bg-indigo-50/30 ${
                    block.previewUrl ? 'p-2' : 'py-10'
                  }`}
                >
                  <input type="file" accept={accept} className="hidden" onChange={handleFileInputChange} />
                  {block.previewUrl ? (
                    block.type === 'video' ? (
                      <video src={block.previewUrl} controls className="max-h-72 w-full rounded-xl" />
                    ) : block.type === 'image' ? (
                      <img src={block.previewUrl} alt={block.fileName ?? ''} className="max-h-72 w-full rounded-xl object-contain" />
                    ) : (
                      <span className="flex items-center gap-2 py-8 text-sm font-medium text-gray-700"><Paperclip size={16} /> {block.fileName}</span>
                    )
                  ) : (
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-500 text-white">
                      <Plus size={22} />
                    </span>
                  )}
                </label>
              )}

              {block.embedUrl && block.type === 'video' && (
                <div className="overflow-hidden rounded-2xl bg-black">
                  <iframe
                    src={block.embedUrl}
                    className="aspect-video w-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              )}

              <div>
                <p className="mb-1.5 text-sm text-gray-500">
                  {block.type === 'video' ? 'Videoning nomi' : block.type === 'image' ? 'Rasmning nomi' : 'Faylning nomi'}
                </p>
                <input
                  value={block.label ?? ''}
                  onChange={(e) => onChangeLabel(e.target.value)}
                  placeholder="Nomini kiriting"
                  className="w-full rounded-xl border-2 border-gray-100 bg-gray-50 px-4 py-2.5 text-sm outline-none focus:border-indigo-400"
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
