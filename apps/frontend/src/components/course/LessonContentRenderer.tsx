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
      className="flex w-fit max-w-full items-center gap-2 rounded-xl bg-gray-100 px-4 py-3 text-left transition-colors hover:bg-gray-200 sm:max-w-md"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white">
        <Radio size={18} />
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-sm font-bold text-gray-900">
          Jonli dars
        </span>
        <span className="block text-xs font-semibold text-gray-400">
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
          className="lesson-reader-html max-w-full overflow-hidden text-sm leading-7 text-gray-900 sm:text-base [&_p]:w-fit [&_p]:max-w-full [&_div]:w-fit [&_div]:max-w-full [&_.bn-block-outer]:w-fit [&_.bn-block-content]:w-fit [&_[data-content-type]]:w-fit [&_iframe]:aspect-video [&_iframe]:w-full [&_img]:h-auto [&_img]:max-w-full [&_img]:cursor-zoom-in [&_img]:rounded-xl [&_video]:aspect-video [&_video]:w-full [&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden [&_.katex-display]:py-1"
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
        <div className="max-w-full overflow-hidden rounded-2xl bg-black">
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
          <figcaption className="mt-2 text-xs font-semibold text-gray-400">
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
          className="flex w-fit max-w-full items-center gap-2 rounded-xl bg-gray-100 px-4 py-3 text-left transition-colors hover:bg-gray-200 sm:max-w-md"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-900 text-[11px] font-black text-white">
            {ext.slice(0, 4)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-bold text-gray-900">
              {block.label || block.fileName || "Fayl"}
            </span>
            <span className="block text-xs font-semibold text-gray-400">
              {isPdf ? "Ko'rish" : "Yuklab olish"}
            </span>
          </span>
          <Download size={18} className="text-gray-400" />
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
          <span className="text-xs font-bold text-gray-600">
            {block.messageSender.name}
          </span>
        </div>
        <div className="flex flex-col gap-1.5">
          {[...lines]
            .sort((a, b) => a.orderIndex - b.orderIndex)
            .map((line) => (
              <div
                key={line.id}
                className="max-w-[85%] rounded-2xl rounded-tl-sm bg-gray-100 px-3.5 py-2.5 text-sm text-gray-800"
              >
                {line.text}
              </div>
            ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-xl bg-gray-50 px-4 py-4 text-sm font-semibold text-gray-400">
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

  return (
    <article className="mx-auto w-full max-w-full overflow-hidden pb-12 text-gray-900">
      <div className="-mx-4 mb-4 bg-white/95 px-4 pb-3 pt-2 backdrop-blur sm:-mx-6 sm:mb-6 sm:px-6 lg:sticky lg:top-0 lg:z-10 lg:-mx-10 lg:px-10">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-semibold text-gray-400 sm:text-xs">
            {moduleTitle}
          </p>
          <h1 className="mt-1.5 text-xl font-black leading-tight text-gray-950 sm:mt-3 sm:text-4xl">
            {lesson.title}
          </h1>
        </div>
      </div>

      <button
        type="button"
        onClick={onOpenMessenger}
        className="mb-5 flex w-full items-center justify-between rounded-2xl bg-gray-100 px-3 py-3 text-left transition-colors sm:mb-6 sm:px-4 lg:rounded-xl hover:bg-gray-200"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-900 text-white sm:h-9 sm:w-9">
            <MessageCircle size={16} />
          </span>
          <span className="min-w-0">
            <span className="block text-xs font-bold text-gray-900">
              {curatorName ? `${curatorName} bilan suhbatlashish` : "Ustozga murojaat"}
            </span>
            <span className="block truncate text-[11px] font-semibold text-gray-500">
              {curatorName
                ? "Kuratorga savolingizni berishingiz mumkin"
                : "Kurator biriktirilmaguncha ustozingizga yozishingiz mumkin"}
            </span>
          </span>
        </span>
        <MessageCircle size={18} className="shrink-0 text-gray-700" />
      </button>

      <div className="space-y-5 sm:space-y-6">
        {readyBlocks.length === 0 ? (
          <div className="rounded-2xl bg-gray-50 py-16 text-center text-gray-400">
            <BookOpen size={30} className="mx-auto mb-3 opacity-50" />
            <p className="text-sm font-semibold">Dars kontenti hozircha tayyor emas</p>
          </div>
        ) : (
          readyBlocks.map((block) => <LessonBlock key={block.id} block={block} />)
        )}
      </div>

      <div className="mt-8 flex items-center justify-between gap-2 sm:mt-10 sm:gap-4">
        <button
          type="button"
          onClick={onPrev}
          disabled={lessonNumber <= 1}
          className="rounded-xl bg-gray-100 px-3.5 py-2.5 text-xs font-bold text-gray-700 disabled:cursor-not-allowed disabled:opacity-40 sm:px-4"
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
          className={`rounded-xl px-3.5 py-2.5 text-xs font-bold text-white sm:px-4 ${
            !hasPractice && blockedByThreshold
              ? "cursor-not-allowed bg-gray-200 text-gray-400"
              : "bg-[var(--color-indigo-500)]"
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
