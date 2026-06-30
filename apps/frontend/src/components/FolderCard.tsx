import type { Folder } from '../api/folders';

interface Props {
  folder: Folder;
  testCount?: number;
  onDoubleClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

export function FolderCard({ folder, testCount, onDoubleClick, onContextMenu }: Props) {
  const color = folder.color ?? '#6B7280';

  return (
    <div
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      className="flex flex-col items-center gap-2 p-4 rounded-2xl cursor-pointer hover:bg-white/70 active:scale-95 select-none w-40 transition-all duration-100"
    >
      <div className="relative w-28 h-20">
        <svg viewBox="0 0 112 80" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-md">
          {/* Back tab */}
          <path
            d="M4 22C4 18.686 6.686 16 10 16H38C40.2 16 42.2 17.1 43.4 18.9L47 24H102C105.314 24 108 26.686 108 30V70C108 73.314 105.314 76 102 76H10C6.686 76 4 73.314 4 70V22Z"
            fill={color}
            opacity="0.3"
          />
          {/* Body */}
          <path
            d="M4 30C4 26.686 6.686 24 10 24H102C105.314 24 108 26.686 108 30V70C108 73.314 105.314 76 102 76H10C6.686 76 4 73.314 4 70V30Z"
            fill={color}
            opacity="0.82"
          />
          {/* Top shine */}
          <path
            d="M4 30C4 26.686 6.686 24 10 24H102C105.314 24 108 26.686 108 30V42H4V30Z"
            fill="white"
            opacity="0.1"
          />
          {/* Papers sticking out */}
          <rect x="28" y="12" width="22" height="28" rx="3" fill="white" opacity="0.5" transform="rotate(-8 28 12)" />
          <rect x="44" y="10" width="22" height="30" rx="3" fill="white" opacity="0.4" transform="rotate(4 44 10)" />
          <rect x="36" y="10" width="22" height="32" rx="3" fill="white" opacity="0.6" />
        </svg>
        {/* Color badge */}
        <div
          className="absolute bottom-1 left-2 w-5 h-5 rounded-full border-2 border-white shadow"
          style={{ backgroundColor: color }}
        />
      </div>

      <div className="text-center">
        <p className="text-[13px] font-semibold text-gray-800 leading-tight line-clamp-2">{folder.name}</p>
        {testCount !== undefined && (
          <p className="text-[11px] text-gray-400 mt-0.5">{testCount} ta test</p>
        )}
      </div>
    </div>
  );
}
