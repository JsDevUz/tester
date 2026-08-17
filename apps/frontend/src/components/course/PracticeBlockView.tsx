import { ClipboardList, Image as ImageIcon, MessagesSquare, ArrowUp, ArrowDown, ChevronDown, ChevronUp, X } from 'lucide-react';
import type { PracticeBlock, PracticeBlockType } from '../../stores/courseStore';
import type { AllTestsItem } from '../../api/tests';

interface PracticeBlockViewProps {
  index: number;
  isFirst: boolean;
  isLast: boolean;
  block: PracticeBlock;
  tests: AllTestsItem[];
  testsLoading?: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onSelectTest: (testId: string) => void;
  onChangeDescription: (description: string) => void;
  onChangeMaxScore: (maxScore: number | null) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

const TYPE_META: Record<PracticeBlockType, { label: string; icon: typeof ClipboardList; placeholder: string }> = {
  test: { label: 'Test', icon: ClipboardList, placeholder: '' },
  image: {
    label: 'Rasm',
    icon: ImageIcon,
    placeholder: "Masalan: Yangi mavzu bo'yicha 50ta gap tuzib daftarga yozing va uni rasmga olib yuklang",
  },
  oral: {
    label: 'Jonli savol-javob',
    icon: MessagesSquare,
    placeholder: "Masalan: O'tilgan mavzu bo'yicha og'zaki savol-javob qiling",
  },
};

export function PracticeBlockView({
  index, isFirst, isLast, block, tests, testsLoading, collapsed, onToggleCollapse,
  onSelectTest, onChangeDescription, onChangeMaxScore, onRemove, onMoveUp, onMoveDown,
}: PracticeBlockViewProps) {
  const meta = TYPE_META[block.type];
  const Icon = meta.icon;
  return (
    <div className="rounded-2xl bg-[var(--surface-bg)]">
      <div className="flex items-center gap-2.5 px-4 py-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--card-bg)] text-[var(--text-secondary)]">
          <Icon size={15} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-[var(--text-primary)]">Amaliyot bloki №{index + 1}</p>
          <p className="text-xs text-[var(--text-muted)]">{meta.label}</p>
        </div>
        <button
          type="button"
          onClick={onMoveUp}
          disabled={isFirst}
          title="Yuqoriga surish"
          className="rounded-lg p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--card-hover)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ArrowUp size={15} />
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={isLast}
          title="Pastga surish"
          className="rounded-lg p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--card-hover)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ArrowDown size={15} />
        </button>
        <button
          type="button"
          onClick={onToggleCollapse}
          className="rounded-lg p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--card-hover)] hover:text-[var(--text-primary)]"
        >
          {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </button>
        <button
          type="button"
          onClick={onRemove}
          title="Blokni o'chirish"
          className="rounded-lg p-1.5 text-[var(--text-muted)] transition-colors hover:bg-red-500/10 hover:text-red-500"
        >
          <X size={16} />
        </button>
      </div>

      {!collapsed && (
        <div className="px-4 py-4">
          {block.type === 'test' ? (
            <>
              <p className="mb-1.5 text-sm text-[var(--text-muted)]">
                Testni tanlang <span className="text-red-500">*</span>
              </p>
              <select
                value={block.testId ?? ''}
                onChange={(e) => onSelectTest(e.target.value)}
                disabled={testsLoading}
                className={`w-full rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] outline-none disabled:cursor-not-allowed disabled:opacity-50 ${
                  block.testId ? 'bg-[var(--card-bg)]' : 'bg-red-500/10'
                }`}
              >
                <option value="" disabled>{testsLoading ? 'Yuklanmoqda...' : 'Testni tanlang...'}</option>
                {tests.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.questionCount} ta savol)
                  </option>
                ))}
              </select>
              {!block.testId && (
                <p className="mt-1 text-xs text-red-500">Test tanlanishi shart</p>
              )}
              <p className="mb-1.5 mt-3 text-sm text-[var(--text-muted)]">Ushbu blok uchun maksimal ball</p>
              <input
                type="number"
                min={0}
                value={block.maxScore ?? ''}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === '') { onChangeMaxScore(null); return; }
                  const num = Number(raw);
                  if (isNaN(num)) return;
                  onChangeMaxScore(Math.max(0, num));
                }}
                placeholder="Masalan: 10"
                className="w-full rounded-xl bg-[var(--card-bg)] px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:ring-1 focus:ring-indigo-500/40 transition-all"
              />
            </>
          ) : (
            <>
              <p className="mb-1.5 text-sm text-[var(--text-muted)]">
                Topshiriq matni <span className="text-red-500">*</span>
              </p>
              <textarea
                value={block.description}
                onChange={(e) => onChangeDescription(e.target.value)}
                placeholder={meta.placeholder}
                rows={3}
                className={`w-full resize-none rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:ring-1 focus:ring-indigo-500/40 transition-all ${
                  block.description.trim() ? 'bg-[var(--card-bg)]' : 'bg-orange-500/10'
                }`}
              />
              {!block.description.trim() && (
                <p className="mt-1 text-xs text-orange-500">Topshiriq matni bo'sh bo'lmasligi shart</p>
              )}
              <p className="mb-1.5 mt-3 text-sm text-[var(--text-muted)]">Ushbu blok uchun maksimal ball</p>
              <input
                type="number"
                min={0}
                value={block.maxScore ?? ''}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === '') { onChangeMaxScore(null); return; }
                  const num = Number(raw);
                  if (isNaN(num)) return;
                  onChangeMaxScore(Math.max(0, num));
                }}
                placeholder="Masalan: 10"
                className="w-full rounded-xl bg-[var(--card-bg)] px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:ring-1 focus:ring-indigo-500/40 transition-all"
              />
              <p className="mt-2 text-xs text-[var(--text-muted)]">
                Ustoz o'quvchi yuklagan rasmni ko'rib, ballni qo'lda qo'yadi.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
