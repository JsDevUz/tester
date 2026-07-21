import { useEffect, useState } from 'react';
import { Inbox } from 'lucide-react';
import { PRACTICE_BLOCK_LIMIT, useCourseStore } from '../../stores/courseStore';
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
    setPracticeBlockDescription, setPracticeBlockMaxScore, setPassThreshold,
  } = useCourseStore();
  const lesson = courses
    .find((c) => c.id === courseId)
    ?.modules.find((m) => m.id === moduleId)
    ?.lessons.find((l) => l.id === lessonId);

  const [tests, setTests] = useState<AllTestsItem[]>([]);
  const [testsLoading, setTestsLoading] = useState(false);
  const [testsError, setTestsError] = useState<string | null>(null);
  const [collapsedBlockIds, setCollapsedBlockIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const hasTestBlocks = lesson?.practiceBlocks.some((b) => b.type === 'test') ?? false;
    if (!hasTestBlocks) {
      setTests([]);
      setTestsLoading(false);
      return;
    }

    let cancelled = false;
    setTestsLoading(true);
    setTestsError(null);
    apiListAllTests()
      .then((items) => {
        if (!cancelled) {
          setTests(items);
          setTestsLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('Failed to load tests:', err);
          setTestsError('Testlar yuklanmadi. Qayta urinib ko\'ring.');
          setTestsLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [lesson?.practiceBlocks]);

  useEffect(() => {
    setCollapsedBlockIds(new Set(lesson?.practiceBlocks.map((block) => block.id) ?? []));
  }, [lessonId]);

  if (!lesson) return null;
  const practiceLimitReached = lesson.practiceBlocks.length >= PRACTICE_BLOCK_LIMIT;

  function toggleCollapse(blockId: string) {
    setCollapsedBlockIds((prev) => {
      const next = new Set(prev);
      if (next.has(blockId)) next.delete(blockId);
      else next.add(blockId);
      return next;
    });
  }

  function handlePickType(type: 'test' | 'image' | 'oral') {
    setCollapsedBlockIds(new Set(lesson!.practiceBlocks.map((block) => block.id)));
    void addPracticeBlock(courseId, moduleId, lessonId, type);
  }

  function handlePercentChange(value: string) {
    // Never toggle enabled state — only update percent
    if (value === '') {
      // Clear → default to 70
      setPassThreshold(courseId, moduleId, lessonId, {
        enabled: lesson!.passThresholdEnabled,
        percent: 70
      });
      return;
    }
    const num = Number(value);
    if (isNaN(num)) return; // Reject NaN silently (type=number prevents, but safety)
    const percent = Math.min(100, Math.max(0, num));
    setPassThreshold(courseId, moduleId, lessonId, {
      enabled: lesson!.passThresholdEnabled,
      percent
    });
  }

  return (
    <div>
      {testsError && (
        <div className="mb-6 rounded-2xl bg-red-50/50 p-3">
          <p className="text-xs text-red-600">{testsError}</p>
        </div>
      )}

      {lesson.practiceBlocks.length === 0 ? (
        <div className="mb-6 rounded-2xl bg-white py-14 text-center">
          <Inbox size={30} className="mx-auto mb-3 text-gray-300" />
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
              testsLoading={testsLoading}
              collapsed={collapsedBlockIds.has(block.id)}
              onToggleCollapse={() => toggleCollapse(block.id)}
              onSelectTest={(testId) => setPracticeBlockTest(courseId, moduleId, lessonId, block.id, testId)}
              onChangeDescription={(description) => setPracticeBlockDescription(courseId, moduleId, lessonId, block.id, description)}
              onChangeMaxScore={(maxScore) => setPracticeBlockMaxScore(courseId, moduleId, lessonId, block.id, maxScore)}
              onRemove={() => removePracticeBlock(courseId, moduleId, lessonId, block.id)}
              onMoveUp={() => movePracticeBlock(courseId, moduleId, lessonId, block.id, 'up')}
              onMoveDown={() => movePracticeBlock(courseId, moduleId, lessonId, block.id, 'down')}
            />
          ))}
        </div>
      )}

      <div className="mb-6">
        <PracticeBlockPicker
          disabled={practiceLimitReached}
          limitText={`Amaliyotda maksimal ${PRACTICE_BLOCK_LIMIT} ta blok`}
          onPickType={(type) => {
            handlePickType(type);
          }}
        />
      </div>

      {lesson.practiceBlocks.some((b) => b.type === 'test') ? (
        <div className="rounded-2xl bg-white p-4">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-800">Minimal o'tish balini talab qilish</p>
              <p className="text-xs text-gray-400">Yoqilsa, o'quvchi belgilangan foizdan kam ball to'plasa dars o'tilmagan hisoblanadi</p>
            </div>
            <button
              type="button"
              onClick={() => {
                const nextEnabled = !lesson.passThresholdEnabled;
                setPassThreshold(courseId, moduleId, lessonId, {
                  enabled: nextEnabled,
                  percent: nextEnabled && lesson.passThresholdPercent == null ? 70 : lesson.passThresholdPercent,
                });
              }}
              className={`relative inline-block h-6 w-11 shrink-0 rounded-full p-0 transition-colors ${
                lesson.passThresholdEnabled ? 'bg-gray-900' : 'bg-gray-200'
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
                  className="w-full rounded-xl bg-gray-50 px-4 py-2.5 pr-9 text-sm outline-none"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-gray-400">%</span>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-2xl bg-gray-50 p-4 text-center">
          <p className="text-xs text-gray-400">Minimal o'tish bali faqat test blok qo'shilganda qo'llaniladi</p>
        </div>
      )}
    </div>
  );
}
