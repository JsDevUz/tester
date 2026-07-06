import { ClipboardList, ArrowUp, ArrowDown, X } from 'lucide-react';
import type { PracticeBlock } from '../../stores/courseStore';
import type { AllTestsItem } from '../../api/tests';

interface PracticeBlockViewProps {
  index: number;
  isFirst: boolean;
  isLast: boolean;
  block: PracticeBlock;
  tests: AllTestsItem[];
  onSelectTest: (testId: string) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

export function PracticeBlockView({
  index, isFirst, isLast, block, tests, onSelectTest, onRemove, onMoveUp, onMoveDown,
}: PracticeBlockViewProps) {
  return (
    <div className="rounded-2xl border-2 border-gray-100 bg-white">
      <div className="flex items-center gap-2.5 px-4 py-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-500">
          <ClipboardList size={15} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-gray-800">Amaliyot bloki №{index + 1}</p>
          <p className="text-xs text-gray-400">Test</p>
        </div>
        <button
          type="button"
          onClick={onMoveUp}
          disabled={isFirst}
          title="Yuqoriga surish"
          className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ArrowUp size={15} />
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={isLast}
          title="Pastga surish"
          className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ArrowDown size={16} />
        </button>
        <button
          type="button"
          onClick={onRemove}
          title="Blokni o'chirish"
          className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
        >
          <X size={16} />
        </button>
      </div>

      <div className="border-t border-gray-100 px-4 py-4">
        <p className="mb-1.5 text-sm text-gray-500">Testni tanlang</p>
        <select
          value={block.testId ?? ''}
          onChange={(e) => onSelectTest(e.target.value)}
          className="w-full rounded-xl border-2 border-gray-100 bg-gray-50 px-4 py-2.5 text-sm outline-none focus:border-indigo-400"
        >
          <option value="" disabled>Testni tanlang...</option>
          {tests.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.questionCount} ta savol)
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
