import { Film, Image as ImageIcon, Paperclip, X } from 'lucide-react';
import type { ContentBlock } from '../../stores/courseStore';
import { EditorBlock } from './EditorBlock';

interface ContentBlockViewProps {
  block: ContentBlock;
  onChangeHtml: (html: string) => void;
  onRemove: () => void;
}

export function ContentBlockView({ block, onChangeHtml, onRemove }: ContentBlockViewProps) {
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onRemove}
        title="Blokni o'chirish"
        className="absolute -right-2 -top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-gray-100 bg-white text-gray-400 opacity-0 shadow-sm transition-opacity hover:text-red-500 group-hover:opacity-100"
      >
        <X size={13} />
      </button>

      {block.type === 'editor' && (
        <EditorBlock html={block.html ?? ''} onChange={onChangeHtml} />
      )}

      {block.type === 'video' && (
        <div className="overflow-hidden rounded-2xl border-2 border-gray-100 bg-black">
          {block.previewUrl
            ? <video src={block.previewUrl} controls className="max-h-96 w-full" />
            : <div className="flex items-center gap-2 p-6 text-gray-400"><Film size={18} /> {block.fileName}</div>}
        </div>
      )}

      {block.type === 'image' && (
        <div className="overflow-hidden rounded-2xl border-2 border-gray-100">
          {block.previewUrl
            ? <img src={block.previewUrl} alt={block.fileName ?? ''} className="max-h-96 w-full object-contain bg-gray-50" />
            : <div className="flex items-center gap-2 p-6 text-gray-400"><ImageIcon size={18} /> {block.fileName}</div>}
        </div>
      )}

      {block.type === 'file' && (
        <div className="flex items-center gap-3 rounded-2xl border-2 border-gray-100 bg-white px-4 py-3.5">
          <Paperclip size={18} className="shrink-0 text-indigo-400" />
          <span className="truncate text-sm font-medium text-gray-700">{block.fileName}</span>
        </div>
      )}
    </div>
  );
}
