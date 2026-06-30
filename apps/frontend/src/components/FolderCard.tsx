import type { Folder } from '../api/folders';

interface Props {
  folder: Folder;
  testCount?: number;
  onDoubleClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

// Lighten a hex color by mixing with white
function lighten(hex: string, amount: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 0xff) + (255 - ((n >> 16) & 0xff)) * amount));
  const g = Math.min(255, Math.round(((n >> 8) & 0xff) + (255 - ((n >> 8) & 0xff)) * amount));
  const b = Math.min(255, Math.round((n & 0xff) + (255 - (n & 0xff)) * amount));
  return `rgb(${r},${g},${b})`;
}

export function FolderCard({ folder, testCount, onDoubleClick, onContextMenu }: Props) {
  const base = folder.color ?? '#5B6A8A';
  const light = lighten(base, 0.28);
  const dark = lighten(base, -0.1 < 0 ? 0 : 0);

  return (
    <div
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      className="flex flex-col items-center gap-2.5 p-3 rounded-2xl cursor-pointer hover:bg-black/5 active:scale-95 select-none transition-all duration-100"
      style={{ width: 140 }}
    >
      {/* macOS-style folder icon */}
      <svg width="120" height="96" viewBox="0 0 120 96" fill="none" xmlns="http://www.w3.org/2000/svg" className="drop-shadow-lg">
        <defs>
          <linearGradient id={`body-${folder.id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={light} />
            <stop offset="100%" stopColor={base} />
          </linearGradient>
          <linearGradient id={`tab-${folder.id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lighten(base, 0.18)} />
            <stop offset="100%" stopColor={lighten(base, 0.05)} />
          </linearGradient>
        </defs>

        {/* Back tab (top-left rounded) */}
        <path
          d="M6 28C6 24.686 8.686 22 12 22H42C44.5 22 46.8 23.3 48.1 25.4L52 32H108C111.314 32 114 34.686 114 38V84C114 87.314 111.314 90 108 90H12C8.686 90 6 87.314 6 84V28Z"
          fill={`url(#tab-${folder.id})`}
        />

        {/* Main folder body */}
        <path
          d="M6 38C6 34.686 8.686 32 12 32H108C111.314 32 114 34.686 114 38V84C114 87.314 111.314 90 108 90H12C8.686 90 6 87.314 6 84V38Z"
          fill={`url(#body-${folder.id})`}
        />

        {/* Inner highlight line at top of body */}
        <path
          d="M6 38C6 34.686 8.686 32 12 32H108C111.314 32 114 34.686 114 38V46H6V38Z"
          fill="white"
          fillOpacity="0.12"
        />

        {/* Bottom inner shadow */}
        <path
          d="M6 78H114V84C114 87.314 111.314 90 108 90H12C8.686 90 6 87.314 6 84V78Z"
          fill="black"
          fillOpacity="0.06"
        />

        {/* Subtle center gloss */}
        <ellipse cx="60" cy="60" rx="38" ry="18" fill="white" fillOpacity="0.04" />
      </svg>

      {/* Name + count */}
      <div className="text-center w-full px-1">
        <p className="text-[13px] font-medium text-gray-800 leading-snug line-clamp-2 break-words">{folder.name}</p>
        {testCount !== undefined && (
          <p className="text-[11px] text-gray-400 mt-0.5">{testCount} Files</p>
        )}
      </div>
    </div>
  );
}
