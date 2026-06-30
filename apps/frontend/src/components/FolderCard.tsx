import { Pencil, Trash2 } from 'lucide-react';
import type { Folder } from '../api/folders';

interface Props {
  folder: Folder;
  testCount?: number;
  onClick: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function lighten(hex: string, amount: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 0xff) + (255 - ((n >> 16) & 0xff)) * amount));
  const g = Math.min(255, Math.round(((n >> 8) & 0xff) + (255 - ((n >> 8) & 0xff)) * amount));
  const b = Math.min(255, Math.round((n & 0xff) + (255 - (n & 0xff)) * amount));
  return `rgb(${r},${g},${b})`;
}

export function FolderCard({ folder, testCount, onClick, onEdit, onDelete }: Props) {
  const base = folder.color ?? '#5B6A8A';
  const light = lighten(base, 0.28);

  return (
    <div
      onClick={onClick}
      className="group relative flex flex-col items-center gap-2.5 p-3 rounded-2xl cursor-pointer hover:bg-black/5 active:scale-95 select-none transition-all duration-100"
      style={{ width: 140 }}
    >
      {/* Action buttons — visible on hover */}
      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
        <button
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          className="w-6 h-6 flex items-center justify-center rounded-lg bg-white/80 backdrop-blur-sm shadow-sm text-gray-500 hover:text-indigo-600 hover:bg-white transition-colors"
        >
          <Pencil size={12} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="w-6 h-6 flex items-center justify-center rounded-lg bg-white/80 backdrop-blur-sm shadow-sm text-gray-500 hover:text-red-500 hover:bg-white transition-colors"
        >
          <Trash2 size={12} />
        </button>
      </div>

      {/* macOS-style folder SVG */}
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
        <path
          d="M6 28C6 24.686 8.686 22 12 22H42C44.5 22 46.8 23.3 48.1 25.4L52 32H108C111.314 32 114 34.686 114 38V84C114 87.314 111.314 90 108 90H12C8.686 90 6 87.314 6 84V28Z"
          fill={`url(#tab-${folder.id})`}
        />
        <path
          d="M6 38C6 34.686 8.686 32 12 32H108C111.314 32 114 34.686 114 38V84C114 87.314 111.314 90 108 90H12C8.686 90 6 87.314 6 84V38Z"
          fill={`url(#body-${folder.id})`}
        />
        <path
          d="M6 38C6 34.686 8.686 32 12 32H108C111.314 32 114 34.686 114 38V46H6V38Z"
          fill="white" fillOpacity="0.12"
        />
        <path
          d="M6 78H114V84C114 87.314 111.314 90 108 90H12C8.686 90 6 87.314 6 84V78Z"
          fill="black" fillOpacity="0.06"
        />
        <ellipse cx="60" cy="60" rx="38" ry="18" fill="white" fillOpacity="0.04" />
      </svg>

      <div className="text-center w-full px-1">
        <p className="text-[13px] font-medium text-gray-800 leading-snug line-clamp-2 break-words">{folder.name}</p>
        {testCount !== undefined && (
          <p className="text-[11px] text-gray-400 mt-0.5">{testCount} ta test</p>
        )}
      </div>
    </div>
  );
}
