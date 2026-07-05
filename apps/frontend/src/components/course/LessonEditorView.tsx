import { useState } from 'react';
import { NotebookPen } from 'lucide-react';
import { useCourseStore, type ContentBlock } from '../../stores/courseStore';
import { BlockPicker } from './BlockPicker';
import { ContentBlockView } from './ContentBlockView';

interface LessonEditorViewProps {
  courseId: string;
  moduleId: string;
  lessonId: string;
}

function newId(): string {
  return crypto.randomUUID();
}

export function LessonEditorView({ courseId, moduleId, lessonId }: LessonEditorViewProps) {
  const { courses, renameLesson, toggleLessonStatus, addBlock, updateBlock, removeBlock, moveBlock } = useCourseStore();
  const lesson = courses
    .find((c) => c.id === courseId)
    ?.modules.find((m) => m.id === moduleId)
    ?.lessons.find((l) => l.id === lessonId);

  const [collapsedBlockIds, setCollapsedBlockIds] = useState<Set<string>>(new Set());

  if (!lesson) return null;

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
    <div className="p-6">
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
  );
}
