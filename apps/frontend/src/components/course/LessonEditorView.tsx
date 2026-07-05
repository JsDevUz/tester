import { ChevronLeft, Sparkles } from 'lucide-react';
import { useCourseStore, type ContentBlock } from '../../stores/courseStore';
import { BlockPicker } from './BlockPicker';
import { ContentBlockView } from './ContentBlockView';

interface LessonEditorViewProps {
  courseId: string;
  moduleId: string;
  lessonId: string;
  onBack: () => void;
}

function newId(): string {
  return crypto.randomUUID();
}

export function LessonEditorView({ courseId, moduleId, lessonId, onBack }: LessonEditorViewProps) {
  const { courses, renameLesson, toggleLessonStatus, addBlock, updateBlock, removeBlock } = useCourseStore();
  const lesson = courses
    .find((c) => c.id === courseId)
    ?.modules.find((m) => m.id === moduleId)
    ?.lessons.find((l) => l.id === lessonId);

  if (!lesson) return null;

  function handlePickEditor() {
    const block: ContentBlock = { id: newId(), type: 'editor', html: '' };
    addBlock(courseId, moduleId, lessonId, block);
  }

  function handlePickFile(type: 'video' | 'image' | 'file', file: File) {
    const block: ContentBlock = {
      id: newId(),
      type,
      fileName: file.name,
      previewUrl: type === 'file' ? undefined : URL.createObjectURL(file),
    };
    addBlock(courseId, moduleId, lessonId, block);
  }

  function handleChangeBlockHtml(blockId: string, html: string) {
    updateBlock(courseId, moduleId, lessonId, blockId, { html });
  }

  return (
    <div className="p-6">
      <button onClick={onBack} className="mb-3 flex items-center gap-1 text-sm text-gray-400 transition-colors hover:text-gray-600">
        <ChevronLeft size={15} /> Darslar
      </button>

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
          <Sparkles size={30} className="mx-auto mb-3 text-indigo-200" />
          <p className="text-sm font-semibold text-gray-700">Ichki kontentini to'ldiring</p>
          <p className="mt-1 text-xs text-gray-400">Bu yer hozircha bo'sh, pastroqda birinchi blokni qo'shing</p>
        </div>
      )}

      {lesson.blocks.length > 0 && (
        <div className="mb-6 flex flex-col gap-3">
          {lesson.blocks.map((block) => (
            <ContentBlockView
              key={block.id}
              block={block}
              onChangeHtml={(html) => handleChangeBlockHtml(block.id, html)}
              onRemove={() => removeBlock(courseId, moduleId, lessonId, block.id)}
            />
          ))}
        </div>
      )}

      <BlockPicker onPickEditor={handlePickEditor} onPickFile={handlePickFile} />
    </div>
  );
}
