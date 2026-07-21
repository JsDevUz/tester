import {
  Film, Image as ImageIcon, Paperclip, LayoutGrid, Radio, ChevronUp, ChevronDown,
  X, Link2, Plus, ArrowUp, ArrowDown, Loader2, ExternalLink, MousePointer2,
  MessageSquareText, Trash2,
} from 'lucide-react';
import type { ContentBlock } from '../../stores/courseStore';
import { EditorBlock } from './EditorBlock';
import { HlsVideoPlayer } from './HlsVideoPlayer';

interface ButtonProps {
  buttonUrl?: string;
  buttonColor?: string;
  buttonTextColor?: string;
  openInNewTab?: boolean;
}

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
  onChangeButtonProps: (data: ButtonProps) => void;
  onAddMessageLine: () => void;
  onChangeMessageLine: (lineId: string, text: string) => void;
  onRemoveMessageLine: (lineId: string) => void;
  onMoveMessageLine: (lineId: string, direction: 'up' | 'down') => void;
  onPickFile: (file: File) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRetryVideo?: () => void;
}

const TYPE_META: Record<ContentBlock['type'], { label: string; icon: typeof Film }> = {
  editor: { label: 'Tahrirchi', icon: LayoutGrid },
  video: { label: 'Video', icon: Film },
  image: { label: 'Rasm', icon: ImageIcon },
  file: { label: 'Fayl', icon: Paperclip },
  live_class: { label: 'Jonli dars', icon: Radio },
  button: { label: 'Tugma', icon: MousePointer2 },
  message: { label: 'Xabar', icon: MessageSquareText },
};

export function ContentBlockView({
  index, isFirst, isLast, block, collapsed, onToggleCollapse, onChangeHtml, onChangeEmbedUrl, onChangeLabel,
  onChangeButtonProps, onAddMessageLine, onChangeMessageLine, onRemoveMessageLine, onMoveMessageLine,
  onPickFile, onRemove, onMoveUp, onMoveDown, onRetryVideo,
}: ContentBlockViewProps) {
  const meta = TYPE_META[block.type];
  const Icon = meta.icon;
  const isUploadingVideo = block.type === 'video' && block.processingStatus === 'uploading';
  const isUploadingFile = block.type === 'file' && block.processingStatus === 'uploading';
  const isUploading = isUploadingVideo || isUploadingFile;

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) onPickFile(file);
    e.target.value = '';
  }

  const accept =
    block.type === 'video'
      ? 'video/*'
      : block.type === 'image'
        ? 'image/*'
        : '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx';

  return (
    <div className="rounded-2xl bg-white">
      <div className="flex items-center gap-2.5 px-4 py-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-700">
          <Icon size={15} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-gray-800">Blok №{index + 1}</p>
          <p className="text-xs text-gray-400">{meta.label}</p>
        </div>
        <button
          type="button"
          onClick={onMoveUp}
          disabled={isFirst || isUploading}
          title="Yuqoriga surish"
          className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ArrowUp size={15} />
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={isLast || isUploading}
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
          disabled={isUploading}
          title="Blokni o'chirish"
          className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <X size={16} />
        </button>
      </div>

      {!collapsed && (
        <div className="px-4 py-4">
          {block.type === 'editor' && (
            <div className="flex flex-col gap-3">
              <div>
                <p className="mb-1.5 text-sm text-gray-500">Blok sarlavhasi</p>
                <input
                  value={block.label ?? ''}
                  onChange={(e) => onChangeLabel(e.target.value)}
                  placeholder="Sarlavhani kiriting"
                  className="w-full rounded-xl bg-gray-50 px-4 py-2.5 text-sm outline-none"
                />
              </div>
              <EditorBlock html={block.html ?? ''} onChange={onChangeHtml} />
            </div>
          )}

          {block.type === 'live_class' && (
            <div className="flex items-center gap-2 rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600">
              <Radio size={16} className="text-indigo-500" />
              <span>Ushbu blok bitta yakunlangan jonli darsga bog'langan. Boshqasini tanlash uchun blokni o'chirib, qayta qo'shing.</span>
            </div>
          )}

          {block.type === 'button' && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-center rounded-xl bg-gray-50 py-6">
                <a
                  href={block.buttonUrl || undefined}
                  onClick={(e) => e.preventDefault()}
                  className="rounded-xl px-5 py-2.5 text-sm font-bold"
                  style={{
                    backgroundColor: block.buttonColor || '#4F46E5',
                    color: block.buttonTextColor || '#FFFFFF',
                  }}
                >
                  {block.label || "O'tish"}
                </a>
              </div>

              <div>
                <p className="mb-1.5 text-sm text-gray-500">Tugma matni</p>
                <input
                  value={block.label ?? ''}
                  onChange={(e) => onChangeLabel(e.target.value)}
                  placeholder="Masalan: O'tish"
                  className="w-full rounded-xl bg-gray-50 px-4 py-2.5 text-sm outline-none"
                />
              </div>

              <div>
                <p className="mb-1.5 text-sm text-gray-500">Bosilganda ochiladigan havola</p>
                <div className="relative">
                  <Link2 size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-300" />
                  <input
                    value={block.buttonUrl ?? ''}
                    onChange={(e) => onChangeButtonProps({ buttonUrl: e.target.value })}
                    placeholder="https://..."
                    className="w-full rounded-xl bg-gray-50 py-2.5 pl-9 pr-4 text-sm outline-none"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2.5 text-sm text-gray-600">
                <input
                  type="checkbox"
                  checked={block.openInNewTab ?? true}
                  onChange={(e) => onChangeButtonProps({ openInNewTab: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300"
                />
                Yangi tabda ochish
              </label>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="mb-1.5 text-sm text-gray-500">Tugma rangi</p>
                  <div className="flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-2">
                    <input
                      type="color"
                      value={block.buttonColor || '#4F46E5'}
                      onChange={(e) => onChangeButtonProps({ buttonColor: e.target.value })}
                      className="h-7 w-7 shrink-0 cursor-pointer rounded"
                    />
                    <input
                      value={block.buttonColor ?? ''}
                      onChange={(e) => onChangeButtonProps({ buttonColor: e.target.value })}
                      placeholder="#4F46E5"
                      className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                    />
                  </div>
                </div>
                <div>
                  <p className="mb-1.5 text-sm text-gray-500">Matn rangi</p>
                  <div className="flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-2">
                    <input
                      type="color"
                      value={block.buttonTextColor || '#FFFFFF'}
                      onChange={(e) => onChangeButtonProps({ buttonTextColor: e.target.value })}
                      className="h-7 w-7 shrink-0 cursor-pointer rounded"
                    />
                    <input
                      value={block.buttonTextColor ?? ''}
                      onChange={(e) => onChangeButtonProps({ buttonTextColor: e.target.value })}
                      placeholder="#FFFFFF"
                      className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {block.type === 'message' && (
            <div className="flex flex-col gap-3">
              <p className="text-xs text-gray-400">
                Yuboruvchi: kurator (yoki biriktirilmagan bo'lsa ustoz) avtomatik ko'rsatiladi
              </p>
              {(block.messageLines ?? []).map((line, lineIndex) => (
                <div key={line.id} className="flex items-start gap-2 rounded-xl bg-gray-50 p-3">
                  <div className="flex flex-1 flex-col gap-1.5">
                    <p className="text-xs text-gray-400">Xabar matni</p>
                    <textarea
                      value={line.text}
                      onChange={(e) => onChangeMessageLine(line.id, e.target.value)}
                      rows={2}
                      className="w-full resize-none rounded-lg bg-white px-3 py-2 text-sm outline-none"
                    />
                  </div>
                  <div className="flex shrink-0 flex-col gap-1">
                    <button
                      type="button"
                      onClick={() => onMoveMessageLine(line.id, 'up')}
                      disabled={lineIndex === 0}
                      className="rounded-lg p-1 text-gray-400 hover:bg-white hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onMoveMessageLine(line.id, 'down')}
                      disabled={lineIndex === (block.messageLines?.length ?? 0) - 1}
                      className="rounded-lg p-1 text-gray-400 hover:bg-white hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      <ArrowDown size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemoveMessageLine(line.id)}
                      disabled={(block.messageLines?.length ?? 0) <= 1}
                      className="rounded-lg p-1 text-gray-400 hover:bg-red-50 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={onAddMessageLine}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-gray-50 py-2.5 text-xs font-semibold text-gray-500 hover:bg-gray-100"
              >
                <Plus size={14} /> Qator qo'shish
              </button>
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
                      className="w-full rounded-xl bg-gray-50 py-2.5 pl-9 pr-4 text-sm outline-none"
                    />
                  </div>
                </div>
              )}

              {!block.embedUrl && block.type === 'video' && block.processingStatus === 'ready' && (
                <HlsVideoPlayer blockId={block.id} />
              )}

              {!block.embedUrl &&
                (block.type === 'video' || block.type === 'file') &&
                (block.processingStatus === 'uploading' ||
                  block.processingStatus === 'pending' ||
                  block.processingStatus === 'processing') && (
                  <div className="rounded-2xl bg-gray-100 px-4 py-5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-gray-700">
                        <Loader2 size={18} className="animate-spin" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-gray-800">
                          {block.processingStatus === 'uploading'
                            ? block.type === 'video'
                              ? 'Video yuklanmoqda'
                              : 'Fayl yuklanmoqda'
                            : block.processingStatus === 'pending'
                              ? 'Video yuklandi, navbatda turibdi'
                              : 'Video HLS formatga tayyorlanmoqda'}
                        </p>
                        <p className="mt-1 text-xs text-gray-500">
                          {block.processingStatus === 'uploading'
                            ? 'Sahifani yopmang. Yuklash tugagach tayyorlash boshlanadi.'
                            : 'Tayyor bo‘lgach shu yerda player ko‘rinadi'}
                        </p>
                      </div>
                      {typeof block.uploadProgress === 'number' && (
                        <span className="shrink-0 text-sm font-bold text-gray-800">
                          {block.uploadProgress}%
                        </span>
                      )}
                    </div>
                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-white">
                      <div
                        className="h-full rounded-full bg-gray-900 transition-all"
                        style={{
                          width: `${block.processingStatus === 'uploading' ? block.uploadProgress ?? 0 : 100}%`,
                        }}
                      />
                    </div>
                  </div>
              )}

              {!block.embedUrl &&
                (block.type === 'video' || block.type === 'file') &&
                block.processingStatus === 'failed' && (
                <div className="rounded-2xl bg-red-50 px-4 py-5 text-center">
                  <p className="text-sm font-semibold text-red-500">
                    {block.type === 'video' ? 'Video tayyorlashda xatolik yuz berdi' : 'Fayl yuklashda xatolik yuz berdi'}
                  </p>
                  {block.errorMessage && <p className="mt-1 text-xs text-red-400">{block.errorMessage}</p>}
                  {block.type === 'video' && onRetryVideo && (
                    <button
                      type="button"
                      onClick={onRetryVideo}
                      className="mt-4 rounded-xl bg-red-500 px-4 py-2 text-sm font-semibold text-white"
                    >
                      Qayta urinish
                    </button>
                  )}
                </div>
              )}

              {!block.embedUrl && block.type !== 'video' && block.processingStatus !== 'uploading' && (
                <label
                  className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl bg-gray-50 transition-colors hover:bg-gray-100 ${
                    block.previewUrl ? 'p-2' : 'py-10'
                  }`}
                >
                  <input type="file" accept={accept} className="hidden" onChange={handleFileInputChange} />
                  {block.previewUrl ? (
                    block.type === 'image' ? (
                      <img src={block.previewUrl} alt={block.fileName ?? ''} className="max-h-72 w-full rounded-xl object-contain" />
                    ) : (
                      <a
                        href={block.previewUrl}
                        download={block.fileName ?? block.label ?? "fayl"}
                        className="flex w-full items-center justify-between gap-3 rounded-xl bg-white px-4 py-5 text-sm font-semibold text-gray-700"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <Paperclip size={16} className="shrink-0 text-gray-600" />
                          <span className="truncate">{block.fileName}</span>
                        </span>
                        <ExternalLink size={16} className="shrink-0 text-gray-400" />
                      </a>
                    )
                  ) : (
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-900 text-white">
                      <Plus size={22} />
                    </span>
                  )}
                </label>
              )}

              {!block.embedUrl && block.type === 'video' && !block.processingStatus && (
                <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl bg-gray-50 py-10 transition-colors hover:bg-gray-100">
                  <input type="file" accept={accept} className="hidden" onChange={handleFileInputChange} />
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-900 text-white">
                    <Plus size={22} />
                  </span>
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
                  className="w-full rounded-xl bg-gray-50 px-4 py-2.5 text-sm outline-none"
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
