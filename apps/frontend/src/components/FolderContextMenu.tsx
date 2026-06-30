import { useEffect, useRef } from 'react';

interface Props {
  x: number;
  y: number;
  onRename: () => void;
  onChangeColor: () => void;
  onDelete: () => void;
  onClose: () => void;
}

export function FolderContextMenu({ x, y, onRename, onChangeColor, onDelete, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  return (
    <div
      ref={ref}
      style={{ position: 'fixed', top: y, left: x, zIndex: 1000 }}
      className="bg-white rounded-xl shadow-xl border border-gray-200 py-1 min-w-36 text-sm"
    >
      <button onClick={onRename} className="w-full text-left px-4 py-1.5 hover:bg-gray-50">Rename</button>
      <button onClick={onChangeColor} className="w-full text-left px-4 py-1.5 hover:bg-gray-50">Change Color</button>
      <div className="border-t border-gray-100 my-1" />
      <button onClick={onDelete} className="w-full text-left px-4 py-1.5 hover:bg-gray-50 text-red-500">Delete</button>
    </div>
  );
}
