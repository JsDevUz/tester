import { Sparkles } from 'lucide-react';
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

  function handleChangeBlockEmbedUrl(blockId: string, embedUrl: string) {
    updateBlock(courseId, moduleId, lessonId, blockId, { embedUrl });
  }

  function handleChangeBlockFileName(blockId: string, fileName: string) {
    updateBlock(courseId, moduleId, lessonId, blockId, { fileName });
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
          <Sparkles size={30} className="mx-auto mb-3 text-indigo-200" />
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
              block={block}
              onChangeHtml={(html) => handleChangeBlockHtml(block.id, html)}
              onChangeEmbedUrl={(embedUrl) => handleChangeBlockEmbedUrl(block.id, embedUrl)}
              onChangeFileName={(fileName) => handleChangeBlockFileName(block.id, fileName)}
              onPickFile={(file) => handleBlockPickFile(block.id, file)}
              onRemove={() => removeBlock(courseId, moduleId, lessonId, block.id)}
            />
          ))}
        </div>
      )}

      <BlockPicker onPickEditor={handlePickEditor} onPickFile={handlePickFile} />
    </div>
  );
}
