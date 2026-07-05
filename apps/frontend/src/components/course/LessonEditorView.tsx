import { useState } from 'react';
import { NotebookPen, Brain } from 'lucide-react';
import { useCourseStore, type ContentBlock } from '../../stores/courseStore';
import { BlockPicker } from './BlockPicker';
import { ContentBlockView } from './ContentBlockView';
import { Breadcrumb } from './Breadcrumb';
import { CourseSidePanel } from './CourseSidePanel';

interface LessonEditorViewProps {
  courseId: string;
  moduleId: string;
  lessonId: string;
  onBackToList: () => void;
  onBackToContent: () => void;
}

function PracticeToggleCard() {
  const [enabled, setEnabled] = useState(false);
  return (
    <div className="flex items-center gap-3 rounded-2xl border-2 border-gray-100 bg-white p-4">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-500">
        <Brain size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-gray-800">Darsning amaliy qismi</p>
        <p className="truncate text-xs text-gray-400">Bilimlarni mustahkamlash</p>
      </div>
      <button
        type="button"
        onClick={() => setEnabled((v) => !v)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${enabled ? 'bg-indigo-500' : 'bg-gray-200'}`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            enabled ? 'translate-x-5' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  );
}

function newId(): string {
  return crypto.randomUUID();
}

export function LessonEditorView({ courseId, moduleId, lessonId, onBackToList, onBackToContent }: LessonEditorViewProps) {
  const { courses, renameLesson, toggleLessonStatus, addBlock, updateBlock, removeBlock, moveBlock } = useCourseStore();
  const course = courses.find((c) => c.id === courseId);
  const module = course?.modules.find((m) => m.id === moduleId);
  const lesson = module?.lessons.find((l) => l.id === lessonId);

  const [collapsedBlockIds, setCollapsedBlockIds] = useState<Set<string>>(new Set());

  if (!course || !module || !lesson) return null;

  function collapseAllExisting() {
    setCollapsedBlockIds(new Set(lesson!.blocks.map((b) => b.id)));
  }

  function handlePickEditor() {
    collapseAllExisting();
    const block: ContentBlock = { id: newId(), type: 'editor', html: '' };
    addBlock(courseId, moduleId, lessonId, block);
  }

  function handlePickFile(type: 'video' | 'image' | 'file', file: File) {
    collapseAllExisting();
    const block: ContentBlock = {
      id: newId(),
      type,
      fileName: file.name,
      previewUrl: type === 'file' ? undefined : URL.createObjectURL(file),
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
            { label: 'Kurslar', onClick: onBackToList },
            { label: course.title, onClick: onBackToContent },
            { label: module.title, onClick: onBackToContent },
            { label: lesson.title },
          ]}
        />
        <div className="mb-6 flex items-center justify-between gap-3">
          <input
            value={lesson.title}
            onChange={(e) => renameLesson(courseId, moduleId, lessonId, e.target.value)}
            className="min-w-0 flex-1 rounded-xl border-2 border-transparent bg-transparent px-1 py-1 text-xl font-bold text-gray-900 outline-none transition-colors focus:border-indigo-200"
          />
          <button
            onClick={() => toggleLessonStatus(courseId, moduleId, lessonId)}
            className={`shrink-0 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
              lesson.status === 'published'
                ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                : 'bg-indigo-500 text-white shadow-lg shadow-indigo-100 hover:bg-indigo-600'
            }`}
          >
            {lesson.status === 'published' ? 'Qoralamaga o\'tkazish' : "E'lon qilish"}
          </button>
        </div>

        {lesson.blocks.length === 0 && (
          <div className="mb-6 rounded-2xl border-2 border-dashed border-gray-200 py-14 text-center">
            <NotebookPen size={30} className="mx-auto mb-3 text-indigo-200" />
            <p className="text-sm font-semibold text-gray-700">Ichki kontentini to'ldiring</p>
            <p className="mt-1 text-xs text-gray-400">Bu yer hozircha bo'sh, pastroqda birinchi blokni qo'shing</p>
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
                onChangeHtml={(html) => handleChangeBlockHtml(block.id, html)}
                onChangeEmbedUrl={(embedUrl) => handleChangeBlockEmbedUrl(block.id, embedUrl)}
                onChangeLabel={(label) => handleChangeBlockLabel(block.id, label)}
                onPickFile={(file) => handleBlockPickFile(block.id, file)}
                onRemove={() => removeBlock(courseId, moduleId, lessonId, block.id)}
                onMoveUp={() => moveBlock(courseId, moduleId, lessonId, block.id, 'up')}
                onMoveDown={() => moveBlock(courseId, moduleId, lessonId, block.id, 'down')}
              />
            ))}
          </div>
        )}

        <BlockPicker onPickEditor={handlePickEditor} onPickFile={handlePickFile} />
      </div>

      <div className="w-full shrink-0 sm:w-72">
        <div className="mb-3">
          <PracticeToggleCard />
        </div>
        <CourseSidePanel onBackToList={onBackToList} variant="lesson" />
      </div>
    </div>
  );
}
