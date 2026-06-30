import type { Folder } from '../api/folders';

interface Props {
  folder: Folder;
  onDoubleClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

export function FolderCard({ folder, onDoubleClick, onContextMenu }: Props) {
  return (
    <div
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      className="flex flex-col items-center gap-1 p-3 rounded-xl cursor-pointer hover:bg-white/60 active:bg-white/80 select-none w-24"
    >
      <div
        className="w-14 h-14 rounded-xl flex items-center justify-center text-3xl shadow-sm"
        style={{ backgroundColor: folder.color + '22', border: `2px solid ${folder.color}44` }}
      >
        <span style={{ color: folder.color }}>📁</span>
      </div>
      <span className="text-xs text-gray-700 text-center break-words w-full leading-tight">
        {folder.name}
      </span>
    </div>
  );
}
