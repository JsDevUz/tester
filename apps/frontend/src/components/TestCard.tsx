import type { Test } from '../api/tests';

interface Props {
  test: Test;
  onDoubleClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

export function TestCard({ test, onDoubleClick, onContextMenu }: Props) {
  return (
    <div
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      className="flex flex-col items-center gap-1 p-3 rounded-xl cursor-pointer hover:bg-white/60 select-none w-28"
    >
      <div className="w-16 h-14 flex items-center justify-center text-4xl">📄</div>
      <span className="text-xs text-gray-700 text-center break-words w-full leading-tight">
        {test.name}
      </span>
      <div className="flex gap-1 flex-wrap justify-center">
        {test.timeLimit && (
          <span className="text-[10px] bg-blue-100 text-blue-600 px-1 rounded">⏱ {test.timeLimit}m</span>
        )}
        {test.shuffleQuestions && (
          <span className="text-[10px] bg-purple-100 text-purple-600 px-1 rounded">🔀</span>
        )}
        {test.oneByOne && (
          <span className="text-[10px] bg-green-100 text-green-600 px-1 rounded">1×1</span>
        )}
        {test.deadline && (
          <span className="text-[10px] bg-orange-100 text-orange-600 px-1 rounded">📅</span>
        )}
      </div>
    </div>
  );
}
