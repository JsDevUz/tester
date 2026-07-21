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
    <div className="flex items-center gap-3 rounded-2xl bg-white p-4">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-700">
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
        className={`relative inline-block h-6 w-11 shrink-0 rounded-full p-0 transition-colors ${enabled ? "bg-gray-900" : "bg-gray-200"}`}
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
    <div className="flex flex-col gap-3 p-6 lg:flex-row">
      <div className="min-w-0 flex-1">
        <div className="mx-auto min-w-0 max-w-5xl">
          <Breadcrumb
            items={[
              { label: "Kurslar", onClick: onBackToList },
              { label: course.title, onClick: onBackToContent },
              { label: module.title, onClick: onBackToContent },
              { label: lesson.title },
            ]}
          />
          <div className="mb-6 flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <input
                value={lesson.title}
                onChange={(e) =>
                  void renameLesson(courseId, moduleId, lessonId, e.target.value)
                }
                className="min-w-0 w-full rounded-xl bg-transparent px-1 py-1 text-xl font-bold text-gray-900 outline-none transition-colors hover:bg-gray-50 focus:bg-gray-50"
              />
              <p className="mt-1 px-1 text-xs font-medium text-gray-400">
                Dars nomini o'zgartirish uchun sarlavha ustiga bosing.
              </p>
            </div>
          </div>

          {activeTab === "content" ? (
            <>
              <div className="mb-4 rounded-2xl bg-white p-4">
                <p className="mb-1.5 text-sm font-semibold text-gray-700">
                  Darsni tamomlash uchun yulduz
                </p>
                <p className="mb-3 text-xs text-gray-400">
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
                  className="w-full rounded-2xl bg-gray-50 px-4 py-2.5 text-sm outline-none"
                />
              </div>

              {lesson.blocks.length === 0 && (
                <div className="mb-6 rounded-2xl bg-white py-14 text-center">
                  <NotebookPen
                    size={30}
                    className="mx-auto mb-3 text-gray-300"
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
                      onChangeButtonProps={(data) =>
                        void updateBlock(courseId, moduleId, lessonId, block.id, data)
                      }
                      onAddMessageLine={() => void addMessageLine(courseId, moduleId, lessonId, block.id)}
                      onChangeMessageLine={(lineId, text) =>
                        void updateMessageLine(courseId, moduleId, lessonId, block.id, lineId, text)
                      }
                      onRemoveMessageLine={(lineId) =>
                        void removeMessageLine(courseId, moduleId, lessonId, block.id, lineId)
                      }
                      onMoveMessageLine={(lineId, direction) =>
                        void moveMessageLine(courseId, moduleId, lessonId, block.id, lineId, direction)
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
                onPickFileFromLibrary={handlePickFileFromLibrary}
                onPickLiveClass={handlePickLiveClass}
                onPickButton={handlePickButton}
                onPickMessage={handlePickMessage}
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
      </div>

      <div className="w-full shrink-0 lg:mt-25 lg:w-72">
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
          onSelectPractice={() => setActiveTab("practice")}
        />
      </div>

      {liveClassPickerOpen && (
        <LiveClassPickerModal
          courseId={courseId}
          onSelect={handleSelectLiveClass}
          onClose={() => setLiveClassPickerOpen(false)}
        />
      )}
    </div>
  );
}
