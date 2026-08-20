import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BookOpen,
  Download,
  FileText,
  Image as ImageIcon,
  MessageCircle,
  Radio,
} from "lucide-react";
import type { ApiMyLesson } from "../../api/groups";
import type { ApiContentBlock } from "../../api/contentBlocks";
import { HlsVideoPlayer } from "./HlsVideoPlayer";
import { ImageLightbox } from "../student/ImageLightbox";
import { PdfViewerSheet } from "../student/PdfViewerSheet";
import { UserAvatar } from "../UserAvatar";

function LiveClassBlockTile({ classSessionId }: { classSessionId: string }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => navigate(`/classroom-history/${classSessionId}/replay`)}
      className="glass-card flex w-fit max-w-full items-center gap-3 rounded-2xl border border-black/5 dark:border-white/10 px-4 py-3 text-left transition-colors hover:border-indigo-500/30 sm:max-w-md cursor-pointer"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white">
        <Radio size={18} />
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-sm font-bold text-[var(--text-primary)]">
          Jonli dars
        </span>
        <span className="block text-xs font-semibold text-[var(--text-muted)]">
          Yozuvni ko'rish
        </span>
      </span>
    </button>
  );
}

export function LessonBlock({ block }: { block: ApiContentBlock }) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [pdfSheetOpen, setPdfSheetOpen] = useState(false);

  if (block.type === "editor") {
    return (
      <>
        <div
          // No overflow-x here: wide children (tables, code blocks) scroll within themselves,
          // which keeps the surrounding prose aligned. A scrollbar on the whole block would
          // let the paragraphs slide sideways too.
          className="lesson-reader-html max-w-full text-sm leading-relaxed text-[var(--text-primary)] sm:text-base [&_iframe]:aspect-video [&_iframe]:w-full [&_img]:h-auto [&_img]:max-w-full [&_img]:cursor-zoom-in [&_img]:rounded-2xl [&_video]:aspect-video [&_video]:w-full [&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden [&_.katex-display]:py-1"
          dangerouslySetInnerHTML={{ __html: block.html ?? "" }}
          onClick={(e) => {
            const target = e.target as HTMLElement;
            if (target.tagName === "IMG") {
              setLightboxSrc((target as HTMLImageElement).src);
            }
          }}
        />
        {lightboxSrc && (
          <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
        )}
      </>
    );
  }

  if (block.type === "video") {
    if (block.embedUrl) {
      return (
        <div className="max-w-full overflow-hidden rounded-2xl bg-black shadow-md">
          <iframe
            src={block.embedUrl}
            title={block.label ?? block.fileName ?? "Video"}
            className="aspect-video w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      );
    }
    return <HlsVideoPlayer blockId={block.id} watermark />;
  }

  if (block.type === "image" && block.previewUrl) {
    return (
      <figure>
        <button
          type="button"
          onClick={() => setLightboxOpen(true)}
          className="block w-full max-w-full cursor-zoom-in overflow-hidden"
          aria-label="Rasmni kattalashtirish"
        >
          <img
            src={block.previewUrl}
            alt={block.label ?? block.fileName ?? ""}
            draggable={false}
            className="max-h-[260px] w-full rounded-2xl object-contain sm:max-h-[420px]"
          />
        </button>
        {block.label && (
          <figcaption className="mt-2 text-xs font-semibold text-[var(--text-muted)]">
            {block.label}
          </figcaption>
        )}
        {lightboxOpen && (
          <ImageLightbox
            src={block.previewUrl}
            alt={block.label ?? block.fileName ?? ""}
            onClose={() => setLightboxOpen(false)}
          />
        )}
      </figure>
    );
  }

  if (block.type === "file" && block.previewUrl) {
    const ext =
      (block.fileName ?? block.label ?? "FILE")
        .split(".")
        .pop()
        ?.toUpperCase() ?? "FILE";
    const isPdf = ext === "PDF";
    return (
      <>
        <button
          type="button"
          onClick={() => {
            if (isPdf) setPdfSheetOpen(true);
            else window.open(block.previewUrl!, "_blank", "noopener,noreferrer");
          }}
          className="glass-card flex w-fit max-w-full items-center gap-3 rounded-2xl border border-black/5 dark:border-white/10 px-4 py-3 text-left transition-colors hover:border-black/20 dark:hover:border-white/20 sm:max-w-md cursor-pointer"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-[11px] font-black text-white">
            {ext.slice(0, 4)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-bold text-[var(--text-primary)]">
              {block.label || block.fileName || "Fayl"}
            </span>
            <span className="block text-xs font-semibold text-[var(--text-muted)]">
              {isPdf ? "Ko'rish" : "Yuklab olish"}
            </span>
          </span>
          <Download size={18} className="text-[var(--text-muted)]" />
        </button>
        {isPdf && pdfSheetOpen && (
          <PdfViewerSheet
            uri={block.previewUrl}
            title={block.label || block.fileName || "Fayl"}
            onClose={() => setPdfSheetOpen(false)}
          />
        )}
      </>
    );
  }

  if (block.type === "live_class" && block.classSessionId) {
    return <LiveClassBlockTile classSessionId={block.classSessionId} />;
  }

  if (block.type === "button") {
    if (!block.buttonUrl) return null;
    return (
      <div className="flex justify-center py-2">
        <a
          href={block.buttonUrl}
          target={block.openInNewTab ? "_blank" : undefined}
          rel={block.openInNewTab ? "noreferrer" : undefined}
          className="rounded-xl px-5 py-2.5 text-sm font-bold"
          style={{
            backgroundColor: block.buttonColor || "#4F46E5",
            color: block.buttonTextColor || "#FFFFFF",
          }}
        >
          {block.label || "O'tish"}
        </a>
      </div>
    );
  }

  if (block.type === "message") {
    const lines = block.messageLines ?? [];
    if (lines.length === 0 || !block.messageSender) return null;
    return (
      <div className="flex flex-col gap-2 py-2">
        <div className="flex items-center gap-2">
          <UserAvatar
            name={block.messageSender.name}
            avatarUrl={block.messageSender.avatarUrl}
            className="h-8 w-8 rounded-full text-xs font-bold"
          />
          <span className="text-xs font-bold text-[var(--text-secondary)]">
            {block.messageSender.name}
          </span>
        </div>
        <div className="flex flex-col gap-1.5">
          {[...lines]
            .sort((a, b) => a.orderIndex - b.orderIndex)
            .map((line) => (
              <div
                key={line.id}
                className="max-w-[85%] rounded-2xl rounded-tl-sm bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/10 px-4 py-2.5 text-sm text-[var(--text-primary)]"
              >
                {line.text}
              </div>
            ))}
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card flex items-center gap-2 rounded-2xl border border-black/5 dark:border-white/10 px-4 py-4 text-sm font-semibold text-[var(--text-muted)]">
      {block.type === "image" ? <ImageIcon size={18} /> : <FileText size={18} />}
      <span>Kontent ochilmadi</span>
    </div>
  );
}

interface LessonReaderProps {
  lesson: ApiMyLesson;
  moduleTitle: string;
  curatorName: string | null;
  lessonNumber: number;
  totalLessons: number;
  hasPractice: boolean;
  blockedByThreshold: boolean;
  onOpenMessenger: () => void;
  onOpenPractice: () => void | Promise<void>;
  onPrev: () => void;
  onNext: () => void | Promise<void>;
}

export function LessonReader({
  lesson,
  moduleTitle,
  curatorName,
  lessonNumber,
  totalLessons,
  hasPractice,
  blockedByThreshold,
  onOpenMessenger,
  onOpenPractice,
  onPrev,
  onNext,
}: LessonReaderProps) {
  const readyBlocks = lesson.blocks.filter(
    (block) =>
      block.type !== "video" ||
      block.embedUrl ||
      block.processingStatus === "ready",
  );

  // min-w-0 rather than overflow-hidden on the article: it still refuses to stretch its
  // parent, but wide children can now show their own scrollbar instead of being clipped.
  return (
    <article className="mx-auto w-full min-w-0 max-w-full pb-12 text-[var(--text-primary)]">
      {/* Seamless Lesson Header */}
      <div className="mb-6">
        <div className="min-w-0">
          <p className="truncate text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
            {moduleTitle}
          </p>
          <h1 className="mt-1.5 text-2xl font-extrabold text-[var(--text-primary)] sm:text-3xl">
            {lesson.title}
          </h1>
        </div>
      </div>

      {/* Curator Message Card */}
      <button
        type="button"
        onClick={onOpenMessenger}
        className="glass-card mb-6 flex w-full items-center justify-between rounded-2xl border border-black/5 dark:border-white/10 p-3.5 sm:p-4 text-left transition-all hover:border-black/15 dark:hover:border-white/20 cursor-pointer"
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
            <MessageCircle size={18} />
          </span>
          <span className="min-w-0">
            <span className="block text-xs font-bold text-[var(--text-primary)]">
              {curatorName ? `${curatorName} bilan suhbatlashish` : "Ustozga murojaat"}
            </span>
            <span className="block truncate text-[11px] font-semibold text-[var(--text-muted)]">
              {curatorName
                ? "Kuratorga savolingizni berishingiz mumkin"
                : "Kurator biriktirilmaguncha ustozingizga yozishingiz mumkin"}
            </span>
          </span>
        </span>
        <MessageCircle size={18} className="shrink-0 text-[var(--text-muted)]" />
      </button>

      {/* Lesson Blocks */}
      <div className="space-y-5 sm:space-y-6">
        {readyBlocks.length === 0 ? (
          <div className="glass-card rounded-3xl border border-black/5 dark:border-white/10 py-16 text-center text-[var(--text-muted)]">
            <BookOpen size={32} className="mx-auto mb-3 opacity-50" />
            <p className="text-sm font-bold text-[var(--text-primary)]">Dars kontenti hozircha tayyor emas</p>
          </div>
        ) : (
          readyBlocks.map((block) => <LessonBlock key={block.id} block={block} />)
        )}
      </div>

      {/* Navigation Footer */}
      <div className="mt-8 flex items-center justify-between gap-2 sm:mt-10 sm:gap-4 pb-[max(16px,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={onPrev}
          disabled={lessonNumber <= 1}
          className="rounded-2xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/10 px-5 py-3 text-xs font-bold text-[var(--text-primary)] hover:bg-black/10 dark:hover:bg-white/10 transition-colors disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
        >
          Orqaga
        </button>
        <button
          type="button"
          onClick={() => {
            if (hasPractice) void onOpenPractice();
            else void onNext();
          }}
          disabled={!hasPractice && blockedByThreshold}
          className={`rounded-2xl px-6 py-3 text-xs font-bold text-white transition-colors shadow-md cursor-pointer ${
            !hasPractice && blockedByThreshold
              ? "cursor-not-allowed bg-black/10 dark:bg-white/10 text-[var(--text-muted)]"
              : "bg-indigo-600 hover:bg-indigo-700"
          }`}
        >
          {hasPractice
            ? "Amaliyot"
            : lessonNumber >= totalLessons
            ? "Yakunlash"
            : "Keyingi dars"}
        </button>
      </div>
      {!hasPractice && blockedByThreshold && (
        <p className="mt-2 text-right text-xs font-semibold text-red-500">
          Keyingi darsni ochish uchun o'tish balidan yetarlicha ball to'plang
        </p>
      )}
    </article>
  );
}
