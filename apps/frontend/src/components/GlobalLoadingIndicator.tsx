import { useEffect, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { useLoadingStore } from '../store/loadingStore';

export function GlobalLoadingIndicator() {
  const active = useLoadingStore((state) => state.count > 0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!active) {
      setVisible(false);
      return;
    }

    const timer = window.setTimeout(() => setVisible(true), 250);
    return () => window.clearTimeout(timer);
  }, [active]);

  if (!visible || !active) return null;

  return (
    <div className="pointer-events-none fixed left-1/2 top-4 z-[9998] -translate-x-1/2">
      <div
        role="status"
        aria-live="polite"
        className="flex items-center gap-2 rounded-full bg-gray-900/95 px-4 py-2 text-xs font-semibold text-white shadow-xl shadow-gray-900/20 backdrop-blur"
      >
        <LoaderCircle size={15} className="animate-spin text-indigo-300" />
        Yuklanmoqda...
      </div>
    </div>
  );
}
