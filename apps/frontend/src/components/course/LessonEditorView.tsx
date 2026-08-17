import { useEffect, useState } from "react";
import { NotebookPen, Brain } from "lucide-react";
import { CONTENT_BLOCK_LIMIT, useCourseStore, type ContentBlock } from "../../stores/courseStore";
import { BlockPicker } from "./BlockPicker";
import { LiveClassPickerModal } from "./LiveClassPickerModal";
import { ContentBlockView } from "./ContentBlockView";
import { Breadcrumb } from "./Breadcrumb";
import { CourseSidePanel } from "./CourseSidePanel";
import { PracticeSection } from "./PracticeSection";

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
    <div className="flex items-center gap-2.5 rounded-2xl bg-[var(--surface-bg)] p-3.5 shadow-xs">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-500">
        <Brain size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-bold text-[var(--text-primary)]">
          Darsning amaliy qismi
        </p>
        <p className="truncate text-[11px] font-medium text-[var(--text-muted)] mt-0.5">
          Bilimlarni mustahkamlash
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={onToggle}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors cursor-pointer focus:outline-none ${
          enabled ? "bg-indigo-600" : "bg-gray-300 dark:bg-zinc-700"
        }`}
      >
        <span
          className={`inline-block h-5 w-5 rounded-full bg-white shadow-md transition-transform ${
            enabled ? "translate-x-5.5" : "translate-x-0.5"
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
    loadCourseDetails,
    loadLessonBlocks,
    renameLesson,
    addBlock,
    addFileBlockFromLibrary,
    addLiveClassBlock,
    addButtonBlock,
    addMessageBlock,
    addMessageLine,
    updateMessageLine,
    removeMessageLine,
    moveMessageLine,
    updateBlock,
    removeBlock,
    moveBlock,
    refreshLessonBlocks,
    retryVideoBlock,
    uploadSubtitleBlock,
    removeSubtitleBlock,
    setLessonPracticeEnabled,
    setLessonCompletionScore,
  } = useCourseStore();
  const course = courses.find((c) => c.id === courseId);
  const module = course?.modules.find((m) => m.id === moduleId);
  const lesson = module?.lessons.find((l) => l.id === lessonId);

  const [collapsedBlockIds, setCollapsedBlockIds] = useState<Set<string>>(
    new Set(),
  );
  const [activeTab, setActiveTab] = useState<"content" | "practice">(
    "content",
  );
  const [liveClassPickerOpen, setLiveClassPickerOpen] = useState(false);

  useEffect(() => {
    if (courseId) void loadCourseDetails(courseId);
  }, [courseId, loadCourseDetails]);

  useEffect(() => {
    if (courseId && moduleId && lessonId) {
      void loadLessonBlocks(courseId, moduleId, lessonId);
    }
  }, [courseId, moduleId, lessonId, loadLessonBlocks]);

  useEffect(() => {
    if (!lesson) return;
    setCollapsedBlockIds(new Set(lesson.blocks.map((block) => block.id)));
  }, [lessonId, lesson?.id]);

  useEffect(() => {
    if (!lesson) return;
    const hasProcessingVideo = lesson.blocks.some(
      (block) => block.type === "video" && (block.processingStatus === "pending" || block.processingStatus === "processing"),
    );
    if (!hasProcessingVideo) return;
    const timer = window.setInterval(() => {
      void refreshLessonBlocks(courseId, moduleId, lessonId);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [courseId, moduleId, lessonId, lesson, refreshLessonBlocks]);

  if (!course || !module || !lesson) return null;

  const contentLimitReached = lesson.blocks.length >= CONTENT_BLOCK_LIMIT;

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

  function handlePickFileFromLibrary(url: string, fileName: string) {
    if (contentLimitReached) return;
    collapseAllExisting();
    void addFileBlockFromLibrary(courseId, moduleId, lessonId, url, fileName);
  }

  function handlePickLiveClass() {
    if (contentLimitReached) return;
    setLiveClassPickerOpen(true);
  }

  function handleSelectLiveClass(classSessionId: string) {
    collapseAllExisting();
    setLiveClassPickerOpen(false);
    void addLiveClassBlock(courseId, moduleId, lessonId, classSessionId);
  }

  function handlePickButton() {
    if (contentLimitReached) return;
    collapseAllExisting();
    void addButtonBlock(courseId, moduleId, lessonId);
  }

  function handlePickMessage() {
    if (contentLimitReached) return;
    collapseAllExisting();
    void addMessageBlock(courseId, moduleId, lessonId);
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
    <div className="min-h-screen p-3 sm:p-4 text-[var(--text-primary)]">
      <div className="flex min-h-full flex-col gap-3">
        <div className="px-1 py-1">
          <Breadcrumb
            items={[
              { label: "Kurslar", onClick: onBackToList },
              { label: course.title, onClick: onBackToContent },
              { label: module.title, onClick: onBackToContent },
              { label: lesson.title },
            ]}
          />
        </div>

        <div className="flex flex-col gap-3 sm:flex-row items-start">
          <div className="min-w-0 flex-1 space-y-3">
            <div className="rounded-2xl bg-[var(--surface-bg)] p-4 sm:p-5 shadow-xs">
              <input
                value={lesson.title}
                onChange={(e) =>
                  void renameLesson(courseId, moduleId, lessonId, e.target.value)
                }
                className="min-w-0 w-full rounded-xl bg-black/5 dark:bg-black/25 border border-black/10 dark:border-white/10 px-4 py-2.5 text-base sm:text-lg font-bold text-[var(--text-primary)] outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 transition-all"
              />
              <p className="mt-1.5 px-1 text-xs font-medium text-[var(--text-muted)]">
                Dars nomini o'zgartirish uchun sarlavha ustiga bosing.
              </p>
            </div>

            {activeTab === "content" ? (
              <>
                <div className="rounded-2xl bg-[var(--surface-bg)] p-4 sm:p-5 shadow-xs">
                  <p className="mb-1 text-xs font-bold text-[var(--text-primary)]">
                    Darsni tamomlash uchun yulduz
                  </p>
                  <p className="mb-3 text-[11px] font-medium text-[var(--text-muted)]">
                    O'quvchi darsni tugatganda beriladigan ball. Amaliyot balidan mustaqil.
                  </p>
                  <input
                    type="number"
                    min={0}
                    value={lesson.completionScore ?? ""}
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (raw === "") {
                        void setLessonCompletionScore(courseId, moduleId, lessonId, null);
                        return;
                      }
                      const num = Number(raw);
                      if (isNaN(num)) return;
                      void setLessonCompletionScore(courseId, moduleId, lessonId, Math.max(0, num));
                    }}
                    placeholder="Masalan: 5"
                    className="w-full rounded-xl bg-black/5 dark:bg-black/25 border border-black/10 dark:border-white/10 py-2.5 px-4 text-xs font-medium text-[var(--text-primary)] outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                  />
                </div>

                {lesson.blocks.length === 0 && (
                  <div className="rounded-2xl bg-[var(--surface-bg)] py-14 text-center shadow-xs">
                    <NotebookPen
                      size={30}
                      className="mx-auto mb-2 text-[var(--text-muted)] opacity-40"
                    />
                    <p className="text-xs font-bold text-[var(--text-primary)]">
                      Bu dars hozircha bo'sh
                    </p>
                    <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                      Pastdagi tugmalar orqali bloklar qo'shing
                    </p>
                  </div>
                )}

                {lesson.blocks.length > 0 && (
                  <div className="flex flex-col gap-2">
                    {lesson.blocks.map((block, index) => (
                      <ContentBlockView
                        key={block.id}
                        index={index}
                        isFirst={index === 0}
                        isLast={index === lesson.blocks.length - 1}
                        block={block}
                        collapsed={collapsedBlockIds.has(block.id)}
                        onToggleCollapse={() => toggleCollapse(block.id)}
                        onChangeHtml={(html) => handleChangeBlockHtml(block.id, html)}
                        onChangeEmbedUrl={(embedUrl) => handleChangeBlockEmbedUrl(block.id, embedUrl)}
                        onChangeLabel={(label) => handleChangeBlockLabel(block.id, label)}
                        onChangeButtonProps={(data) => void updateBlock(courseId, moduleId, lessonId, block.id, data)}
                        onAddMessageLine={() => void addMessageLine(courseId, moduleId, lessonId, block.id)}
                        onChangeMessageLine={(lineId, text) => void updateMessageLine(courseId, moduleId, lessonId, block.id, lineId, text)}
                        onRemoveMessageLine={(lineId) => void removeMessageLine(courseId, moduleId, lessonId, block.id, lineId)}
                        onMoveMessageLine={(lineId, direction) => void moveMessageLine(courseId, moduleId, lessonId, block.id, lineId, direction)}
                        onPickFile={(file) => handleBlockPickFile(block.id, file)}
                        onRetryVideo={() => void retryVideoBlock(courseId, moduleId, lessonId, block.id)}
                        onUploadSubtitle={(file) => void uploadSubtitleBlock(courseId, moduleId, lessonId, block.id, file)}
                        onRemoveSubtitle={() => void removeSubtitleBlock(courseId, moduleId, lessonId, block.id)}
                        onRemove={() => void removeBlock(courseId, moduleId, lessonId, block.id)}
                        onMoveUp={() => void moveBlock(courseId, moduleId, lessonId, block.id, "up")}
                        onMoveDown={() => void moveBlock(courseId, moduleId, lessonId, block.id, "down")}
                      />
                    ))}
                  </div>
                )}

                <div className="pt-2">
                  <p className="mb-2.5 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] px-1">
                    Blok qo'shish {lesson.blocks.length > 0 && `(${lesson.blocks.length}/30)`}
                  </p>
                  {contentLimitReached && (
                    <p className="mb-3 rounded-xl bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-600 dark:text-amber-400">
                      Bitta darsga maksimal 30 ta blok qo'shish mumkin. Yangi blok qo'shish uchun avval mavjud bloklardan birini o'chiring.
                    </p>
                  )}
                  <BlockPicker
                    onPickEditor={handlePickEditor}
                    onPickFile={handlePickFile}
                    onPickFileFromLibrary={handlePickFileFromLibrary}
                    onPickLiveClass={handlePickLiveClass}
                    onPickButton={handlePickButton}
                    onPickMessage={handlePickMessage}
                    disabled={contentLimitReached}
                    limitText={`Kontentda maksimal ${CONTENT_BLOCK_LIMIT} ta blok`}
                  />
                </div>
              </>
            ) : (
              <PracticeSection
                courseId={courseId}
                moduleId={moduleId}
                lessonId={lessonId}
              />
            )}
          </div>

          <div className="flex w-full shrink-0 flex-col gap-2 sm:w-68">
            <PracticeToggleCard
              enabled={lesson.practiceEnabled}
              onToggle={handleTogglePractice}
            />
            <CourseSidePanel
              onBackToList={onBackToList}
              variant="lesson"
              practiceEnabled={lesson.practiceEnabled}
              activeTab={activeTab}
              onSelectContent={() => setActiveTab("content")}
              onSelectPractice={() => setActiveTab("practice")}
            />
          </div>
        </div>

        {liveClassPickerOpen && (
          <LiveClassPickerModal
            courseId={courseId}
            onSelect={handleSelectLiveClass}
            onClose={() => setLiveClassPickerOpen(false)}
          />
        )}
      </div>
    </div>
  );
}
