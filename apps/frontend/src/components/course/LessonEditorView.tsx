import { useState } from "react";
import { NotebookPen, Brain } from "lucide-react";
import { CONTENT_BLOCK_LIMIT, useCourseStore, type ContentBlock } from "../../stores/courseStore";
import { BlockPicker } from "./BlockPicker";
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
    addBlock,
    updateBlock,
    removeBlock,
    moveBlock,
    setLessonPracticeEnabled,
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
    addBlock(courseId, moduleId, lessonId, block);
  }

  function handlePickFile(type: "video" | "image" | "file", file: File) {
    if (contentLimitReached) return;
    collapseAllExisting();
    const block: ContentBlock = {
      id: newId(),
      type,
      fileName: file.name,
      previewUrl: type === "file" ? undefined : URL.createObjectURL(file),
    };
    addBlock(courseId, moduleId, lessonId, block);
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
    updateBlock(courseId, moduleId, lessonId, blockId, { html });
  }

  function handleChangeBlockEmbedUrl(blockId: string, embedUrl: string) {
    updateBlock(courseId, moduleId, lessonId, blockId, { embedUrl });
  }

  function handleChangeBlockLabel(blockId: string, label: string) {
    updateBlock(courseId, moduleId, lessonId, blockId, { label });
  }

  function handleBlockPickFile(blockId: string, file: File) {
    updateBlock(courseId, moduleId, lessonId, blockId, {
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
              renameLesson(courseId, moduleId, lessonId, e.target.value)
            }
            className="min-w-0 flex-1 rounded-xl bg-transparent px-1 py-1 text-xl font-bold text-gray-900 outline-none transition-colors"
          />
        </div>

        {activeTab === "content" ? (
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
                    onRemove={() =>
                      removeBlock(courseId, moduleId, lessonId, block.id)
                    }
                    onMoveUp={() =>
                      moveBlock(courseId, moduleId, lessonId, block.id, "up")
                    }
                    onMoveDown={() =>
                      moveBlock(courseId, moduleId, lessonId, block.id, "down")
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
          onSelectPractice={() => setActiveTab("practice")}
        />
      </div>
    </div>
  );
}
