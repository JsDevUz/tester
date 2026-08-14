import type React from "react";
import { useCallback, useRef, useState } from "react";

export function DropPinEditor({
  imageUrl,
  correctAnswer,
  radiusPct,
  onChange,
}: {
  imageUrl: string;
  correctAnswer: string;
  radiusPct: number;
  onChange: (v: string) => void;
}) {
  const [containerW, setContainerW] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      setContainerW(rect.width);
      const x = ((e.clientX - rect.left) / rect.width).toFixed(4);
      const y = ((e.clientY - rect.top) / rect.height).toFixed(4);
      onChange(`${x},${y}`);
    },
    [onChange],
  );

  const pin = correctAnswer ? correctAnswer.split(",").map(Number) : null;
  const radiusPx =
    (radiusPct / 100) *
    (containerW || containerRef.current?.getBoundingClientRect().width || 300);

  return (
    <div
      ref={containerRef}
      className="relative w-full cursor-crosshair"
      onClick={handleClick}
    >
      <img
        src={imageUrl}
        alt=""
        className="w-full rounded-xl object-contain select-none pointer-events-none"
        draggable={false}
      />
      {pin && (
        <>
          <div
            className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none rounded-full border border-red-400/50 bg-red-100/30"
            style={{
              left: `${pin[0] * 100}%`,
              top: `${pin[1] * 100}%`,
              width: radiusPx * 2,
              height: radiusPx * 2,
            }}
          />
          <div
            className="absolute w-5 h-5 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
            style={{ left: `${pin[0] * 100}%`, top: `${pin[1] * 100}%` }}
          >
            <div className="w-5 h-5 rounded-full bg-red-500 border border-white shadow-lg" />
          </div>
        </>
      )}
    </div>
  );
}
