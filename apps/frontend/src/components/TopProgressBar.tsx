import { useEffect, useRef, useState } from 'react';
import { useLoadingStore } from '../store/loadingStore';

export function TopProgressBar() {
  const active = useLoadingStore((s) => s.count > 0);
  const [width, setWidth] = useState(0);
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (active) {
      setVisible(true);
      setWidth(20);
      timer.current = setInterval(() => {
        setWidth((w) => {
          if (w >= 85) { clearInterval(timer.current!); return 85; }
          return w + Math.random() * 8;
        });
      }, 300);
    } else {
      if (timer.current) clearInterval(timer.current);
      setWidth(100);
      fadeTimer.current = setTimeout(() => {
        setVisible(false);
        setWidth(0);
      }, 300);
    }
    return () => {
      if (timer.current) clearInterval(timer.current);
      if (fadeTimer.current) clearTimeout(fadeTimer.current);
    };
  }, [active]);

  if (!visible) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] h-0.5 pointer-events-none">
      <div
        className="h-full bg-indigo-500 transition-all"
        style={{
          width: `${width}%`,
          transitionDuration: active ? '300ms' : '200ms',
          opacity: width === 100 && !active ? 0 : 1,
        }}
      />
    </div>
  );
}
