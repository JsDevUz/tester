import { useEffect, useState } from 'react';
import { Inbox } from 'lucide-react';
import { useCourseStore } from '../../stores/courseStore';
import { apiListAllTests, type AllTestsItem } from '../../api/tests';
import { PracticeBlockView } from './PracticeBlockView';
import { PracticeBlockPicker } from './PracticeBlockPicker';

interface PracticeSectionProps {
  courseId: string;
  moduleId: string;
  lessonId: string;
}

export function PracticeSection({ courseId, moduleId, lessonId }: PracticeSectionProps) {
  const {
    courses, addPracticeBlock, removePracticeBlock, movePracticeBlock, setPracticeBlockTest,
    setPracticeBlockDescription, setPassThreshold,
  } = useCourseStore();
  const lesson = courses
    .find((c) => c.id === courseId)
    ?.modules.find((m) => m.id === moduleId)
    ?.lessons.find((l) => l.id === lessonId);

  const [tests, setTests] = useState<AllTestsItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    apiListAllTests().then((items) => { if (!cancelled) setTests(items); });
    return () => { cancelled = true; };
  }, []);

  if (!lesson) return null;

  function handlePercentChange(value: string) {
    const percent = value === '' ? null : Math.min(100, Math.max(0, Number(value)));
    setPassThreshold(courseId, moduleId, lessonId, { enabled: true, percent });
  }

  return (
    <div>
      {lesson.practiceBlocks.length === 0 ? (
        <div className="mb-6 rounded-2xl border-2 border-dashed border-gray-200 py-14 text-center">
          <Inbox size={30} className="mx-auto mb-3 text-indigo-200" />
          <p className="text-sm font-semibold text-gray-700">Hali blok qo'shilmagan</p>
          <p className="mt-1 text-xs text-gray-400">Pastroqdan blok qo'shing</p>
        </div>
      ) : (
        <div className="mb-6 flex flex-col gap-3">
          {lesson.practiceBlocks.map((block, index) => (
            <PracticeBlockView
              key={block.id}
              index={index}
              isFirst={index === 0}
              isLast={index === lesson.practiceBlocks.length - 1}
              block={block}
              tests={tests}
              onSelectTest={(testId) => setPracticeBlockTest(courseId, moduleId, lessonId, block.id, testId)}
              onChangeDescription={(description) => setPracticeBlockDescription(courseId, moduleId, lessonId, block.id, description)}
              onRemove={() => removePracticeBlock(courseId, moduleId, lessonId, block.id)}
              onMoveUp={() => movePracticeBlock(courseId, moduleId, lessonId, block.id, 'up')}
              onMoveDown={() => movePracticeBlock(courseId, moduleId, lessonId, block.id, 'down')}
            />
          ))}
        </div>
      )}

      <div className="mb-6">
        <PracticeBlockPicker onPickType={(type) => addPracticeBlock(courseId, moduleId, lessonId, type)} />
      </div>

      <div className="rounded-2xl border-2 border-gray-100 bg-white p-4">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-800">Minimal o'tish balini talab qilish</p>
            <p className="text-xs text-gray-400">Yoqilsa, o'quvchi belgilangan foizdan kam ball to'plasa dars o'tilmagan hisoblanadi</p>
          </div>
          <button
            type="button"
            onClick={() => setPassThreshold(courseId, moduleId, lessonId, { enabled: !lesson.passThresholdEnabled })}
            className={`relative inline-block h-6 w-11 shrink-0 rounded-full border-0 p-0 transition-colors ${
              lesson.passThresholdEnabled ? 'bg-indigo-500' : 'bg-gray-200'
            }`}
          >
            <span
              className={`absolute top-0.5 block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                lesson.passThresholdEnabled ? 'translate-x-5' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>

        {lesson.passThresholdEnabled && (
          <div className="mt-3">
            <p className="mb-1.5 text-sm text-gray-500">Minimal foiz</p>
            <div className="relative">
              <input
                type="number"
                min={0}
                max={100}
                value={lesson.passThresholdPercent ?? ''}
                onChange={(e) => handlePercentChange(e.target.value)}
                placeholder="70"
                className="w-full rounded-xl border-2 border-gray-100 bg-gray-50 px-4 py-2.5 pr-9 text-sm outline-none focus:border-indigo-400"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-gray-400">%</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
