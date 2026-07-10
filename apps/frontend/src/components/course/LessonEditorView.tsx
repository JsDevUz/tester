import { useEffect, useState } from "react";
import { NotebookPen, Brain, Trash2 } from "lucide-react";
import { CONTENT_BLOCK_LIMIT, useCourseStore, type ContentBlock } from "../../stores/courseStore";
import { BlockPicker } from "./BlockPicker";
import { ContentBlockView } from "./ContentBlockView";
import { Breadcrumb } from "./Breadcrumb";
import { CourseSidePanel } from "./CourseSidePanel";
import { PracticeSection } from "./PracticeSection";
import { ConfirmDeleteModal } from "./ConfirmDeleteModal";

interface LessonEditorViewProps {
  courseId: string;
  moduleId: string;
  lessonId: string;
  onBackToList: () => void;
  onBackToContent: () => void;
}

function PracticeToggleCard({
  enabled,
  onToggle,
}: {
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white p-4">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-500">
        <Brain size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-gray-800">
          Darsning amaliy qismi
        </p>
        <p className="truncate text-xs text-gray-400">
          Bilimlarni mustahkamlash
        </p>
      </div>
      <button
        type="button"
        onClick={onToggle}
        className={`relative inline-block h-6 w-11 shrink-0 rounded-full p-0 transition-colors ${enabled ? "bg-indigo-500" : "bg-gray-200"}`}
      >
        <span
          className={`absolute top-0.5 block h-5 w-5 rounded-full bg-white shadow transition-transform ${
            enabled ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}

function newId(): string {
  return crypto.randomUUID();
}

export function LessonEditorView({
  courseId,
  moduleId,
  lessonId,
  onBackToList,
  onBackToContent,
}: LessonEditorViewProps) {
  const {
    courses,
    renameLesson,
    deleteLesson,
    addBlock,
    updateBlock,
    removeBlock,
    moveBlock,
    refreshLessonBlocks,
    retryVideoBlock,
    setLessonPracticeEnabled,
    setLessonCompletionScore,
  } = useCourseStore();
  const course = courses.find((c) => c.id === courseId);
  const module = course?.modules.find((m) => m.id === moduleId);
  const lesson = module?.lessons.find((l) => l.id === lessonId);

  const [collapsedBlockIds, setCollapsedBlockIds] = useState<Set<string>>(
    new Set(),
  );
  const [activeTab, setActiveTab] = useState<"content" | "settings" | "practice">(
    "content",
  );
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!course || !module || !lesson) return null;

  const contentLimitReached = lesson.blocks.length >= CONTENT_BLOCK_LIMIT;

  useEffect(() => {
    const hasProcessingVideo = lesson.blocks.some(
      (block) => block.type === "video" && (block.processingStatus === "pending" || block.processingStatus === "processing"),
    );
    if (!hasProcessingVideo) return;
    const timer = window.setInterval(() => {
      void refreshLessonBlocks(courseId, moduleId, lessonId);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [courseId, moduleId, lessonId, lesson.blocks, refreshLessonBlocks]);

  function handleTogglePractice() {
    const next = !lesson!.practiceEnabled;
    setLessonPracticeEnabled(courseId, moduleId, lessonId, next);
    if (!next && activeTab === "practice") setActiveTab("content");
  }

  function collapseAllExisting() {
    setCollapsedBlockIds(new Set(lesson!.blocks.map((b) => b.id)));
  }

  function handlePickEditor() {
    if (contentLimitReached) return;
    collapseAllExisting();
    const block: ContentBlock = { id: newId(), type: "editor", html: "" };
    void addBlock(courseId, moduleId, lessonId, block);
  }

  function handlePickFile(type: "video" | "image" | "file", file: File) {
    if (contentLimitReached) return;
    collapseAllExisting();
    const block: ContentBlock = {
      id: newId(),
      type,
      fileName: file.name,
      label: file.name,
      previewUrl: type === "image" ? URL.createObjectURL(file) : undefined,
      processingStatus: type === "video" ? "pending" : undefined,
    };
    void addBlock(courseId, moduleId, lessonId, block, type === "video" || type === "file" ? file : undefined);
  }

  function toggleCollapse(blockId: string) {
    setCollapsedBlockIds((prev) => {
      const next = new Set(prev);
      if (next.has(blockId)) next.delete(blockId);
      else next.add(blockId);
      return next;
    });
  }

  function handleChangeBlockHtml(blockId: string, html: string) {
    void updateBlock(courseId, moduleId, lessonId, blockId, { html });
  }

  function handleChangeBlockEmbedUrl(blockId: string, embedUrl: string) {
    void updateBlock(courseId, moduleId, lessonId, blockId, { embedUrl });
  }

  function handleChangeBlockLabel(blockId: string, label: string) {
    void updateBlock(courseId, moduleId, lessonId, blockId, { label });
  }

  function handleBlockPickFile(blockId: string, file: File) {
    void updateBlock(courseId, moduleId, lessonId, blockId, {
      fileName: file.name,
      previewUrl: URL.createObjectURL(file),
    });
  }

  return (
    <div className="flex flex-col gap-3 p-6 sm:flex-row">
      <div className="min-w-0 flex-1">
        <Breadcrumb
          items={[
            { label: "Kurslar", onClick: onBackToList },
            { label: course.title, onClick: onBackToContent },
            { label: module.title, onClick: onBackToContent },
            { label: lesson.title },
          ]}
        />
        <div className="mb-6 flex items-center justify-between gap-3">
          <input
            value={lesson.title}
            onChange={(e) =>
              void renameLesson(courseId, moduleId, lessonId, e.target.value)
            }
            className="min-w-0 flex-1 rounded-xl bg-transparent px-1 py-1 text-xl font-bold text-gray-900 outline-none transition-colors hover:bg-gray-50 focus:bg-gray-50"
          />
        </div>

        {activeTab === "settings" ? (
          <div className="rounded-2xl bg-white p-5">
            <h2 className="mb-1 text-lg font-bold text-gray-800">Dizayn va parametrlar</h2>
            <p className="mb-4 text-sm text-gray-500">Dars nomi</p>
            <input
              value={lesson.title}
              onChange={(e) => void renameLesson(courseId, moduleId, lessonId, e.target.value)}
              className="mb-4 w-full rounded-2xl bg-gray-50 px-4 py-2.5 text-sm outline-none"
            />

            <p className="mb-1.5 text-sm text-gray-500">Darsni tamomlash uchun yulduz</p>
            <p className="mb-2 text-xs text-gray-400">O'quvchi darsni tugatganda (Keyingi dars tugmasi) beriladigan ball. Amaliyot balidan mustaqil.</p>
            <input
              type="number"
              min={0}
              value={lesson.completionScore ?? ''}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === '') { void setLessonCompletionScore(courseId, moduleId, lessonId, null); return; }
                const num = Number(raw);
                if (isNaN(num)) return;
                void setLessonCompletionScore(courseId, moduleId, lessonId, Math.max(0, num));
              }}
              placeholder="Masalan: 5"
              className="mb-4 w-full rounded-2xl bg-gray-50 px-4 py-2.5 text-sm outline-none"
            />

            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-red-50 py-3 text-sm font-semibold text-red-600 transition-colors hover:bg-red-100"
            >
              <Trash2 size={16} /> Darsni o'chirish
            </button>
          </div>
        ) : activeTab === "content" ? (
          <>
            {lesson.blocks.length === 0 && (
              <div className="mb-6 rounded-2xl bg-white py-14 text-center">
                <NotebookPen
                  size={30}
                  className="mx-auto mb-3 text-indigo-200"
                />
                <p className="text-sm font-semibold text-gray-700">
                  Ichki kontentini to'ldiring
                </p>
                <p className="mt-1 text-xs text-gray-400">
                  Bu yer hozircha bo'sh, pastroqda birinchi blokni qo'shing
                </p>
              </div>
            )}

            {lesson.blocks.length > 0 && (
              <div className="mb-6 flex flex-col gap-3">
                {lesson.blocks.map((block, index) => (
                  <ContentBlockView
                    key={block.id}
                    index={index}
                    isFirst={index === 0}
                    isLast={index === lesson.blocks.length - 1}
                    block={block}
                    collapsed={collapsedBlockIds.has(block.id)}
                    onToggleCollapse={() => toggleCollapse(block.id)}
                    onChangeHtml={(html) =>
                      handleChangeBlockHtml(block.id, html)
                    }
                    onChangeEmbedUrl={(embedUrl) =>
                      handleChangeBlockEmbedUrl(block.id, embedUrl)
                    }
                    onChangeLabel={(label) =>
                      handleChangeBlockLabel(block.id, label)
                    }
                    onPickFile={(file) => handleBlockPickFile(block.id, file)}
                    onRetryVideo={() => void retryVideoBlock(courseId, moduleId, lessonId, block.id)}
                    onRemove={() =>
                      void removeBlock(courseId, moduleId, lessonId, block.id)
                    }
                    onMoveUp={() =>
                      void moveBlock(courseId, moduleId, lessonId, block.id, "up")
                    }
                    onMoveDown={() =>
                      void moveBlock(courseId, moduleId, lessonId, block.id, "down")
                    }
                  />
                ))}
              </div>
            )}

            <BlockPicker
              onPickEditor={handlePickEditor}
              onPickFile={handlePickFile}
              disabled={contentLimitReached}
              limitText={`Kontentda maksimal ${CONTENT_BLOCK_LIMIT} ta blok`}
            />
          </>
        ) : (
          <PracticeSection
            courseId={courseId}
            moduleId={moduleId}
            lessonId={lessonId}
          />
        )}
      </div>

      <div className="w-full shrink-0 sm:mt-25 sm:w-72">
        <div className="mb-3">
          <PracticeToggleCard
            enabled={lesson.practiceEnabled}
            onToggle={handleTogglePractice}
          />
        </div>
        <CourseSidePanel
          onBackToList={onBackToList}
          variant="lesson"
          practiceEnabled={lesson.practiceEnabled}
          activeTab={activeTab}
          onSelectContent={() => setActiveTab("content")}
          onSelectSettings={() => setActiveTab("settings")}
          onSelectPractice={() => setActiveTab("practice")}
        />
      </div>

      {confirmDelete && (
        <ConfirmDeleteModal
          title="Darsni o'chirish"
          description={`"${lesson.title}" darsi va uning kontenti o'chiriladi.`}
          onConfirm={async () => {
            await deleteLesson(courseId, moduleId, lessonId);
            setConfirmDelete(false);
            onBackToContent();
          }}
          onClose={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}
