import type { PointerEvent as ReactPointerEvent } from "react";
import { Copy, RotateCw, Trash2 } from "lucide-react";
import { LAYER_OPTIONS } from "./ClassroomTextStylePanel";

interface ClassroomPageLassoOverlayProps {
  selectedGroupBounds: {
    left: number;
    top: number;
    right: number;
    bottom: number;
  };
  selectedGroupIds: Set<string>;
  pageNumber: number;
  onReorderStroke?: (
    page: number,
    strokeIds: string[],
    op: "front" | "back" | "forward" | "backward",
  ) => void;
  onCopySelectedGroup: () => void;
  onDeleteSelectedGroup: () => void;
  onBeginGroupResize: (
    event: ReactPointerEvent<HTMLButtonElement>,
    corner: "nw" | "ne" | "sw" | "se",
  ) => void;
  onTransformGroupResize: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onFinishGroupResize: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onBeginGroupRotate: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onTransformGroupRotate: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onFinishGroupRotate: (event: ReactPointerEvent<HTMLButtonElement>) => void;
}

export function ClassroomPageLassoOverlay({
  selectedGroupBounds,
  selectedGroupIds,
  pageNumber,
  onReorderStroke,
  onCopySelectedGroup,
  onDeleteSelectedGroup,
  onBeginGroupResize,
  onTransformGroupResize,
  onFinishGroupResize,
  onBeginGroupRotate,
  onTransformGroupRotate,
  onFinishGroupRotate,
}: ClassroomPageLassoOverlayProps) {
  return (
    <div
      className="pointer-events-none absolute z-20 border-2 border-dashed border-indigo-500 bg-indigo-500/5"
      style={{
        left: `${selectedGroupBounds.left * 100}%`,
        top: `${selectedGroupBounds.top * 100}%`,
        width: `${(selectedGroupBounds.right - selectedGroupBounds.left) * 100}%`,
        height: `${(selectedGroupBounds.bottom - selectedGroupBounds.top) * 100}%`,
      }}
    >
      {(["nw", "ne", "sw", "se"] as const).map((corner) => (
        <button
          key={corner}
          type="button"
          aria-label={`Guruh o'lchamini ${corner} tomondan o'zgartirish`}
          className={`pointer-events-auto absolute h-3 w-3 rounded-sm border-2 border-indigo-500 bg-white ${
            corner.includes("n") ? "-top-1.5" : "-bottom-1.5"
          } ${corner.includes("w") ? "-left-1.5" : "-right-1.5"}`}
          style={{
            cursor:
              corner === "nw" || corner === "se"
                ? "nwse-resize"
                : "nesw-resize",
          }}
          onPointerDown={(event) => onBeginGroupResize(event, corner)}
          onPointerMove={onTransformGroupResize}
          onPointerUp={onFinishGroupResize}
          onPointerCancel={onFinishGroupResize}
        />
      ))}
      <div className="pointer-events-auto absolute -top-9 left-1/2 flex -translate-x-1/2 items-center gap-1">
        {LAYER_OPTIONS.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            aria-label={label}
            title={label}
            onClick={() =>
              onReorderStroke?.(
                pageNumber,
                [...selectedGroupIds],
                value,
              )
            }
            className="rounded-full bg-white p-1.5 text-gray-600 shadow-md hover:bg-gray-100 cursor-pointer"
          >
            <Icon size={13} />
          </button>
        ))}
        <button
          type="button"
          aria-label="Tanlangan guruhni nusxalash"
          title="Nusxalash"
          onClick={onCopySelectedGroup}
          className="rounded-full bg-white p-1.5 text-gray-600 shadow-md hover:bg-gray-100 cursor-pointer"
        >
          <Copy size={13} />
        </button>
        <button
          type="button"
          aria-label="Tanlangan guruhni o'chirish"
          onClick={onDeleteSelectedGroup}
          className="rounded-full bg-red-500 p-1.5 text-white shadow-md hover:bg-red-600 cursor-pointer"
        >
          <Trash2 size={13} />
        </button>
      </div>
      <div className="pointer-events-none absolute left-1/2 -bottom-8 h-6 w-px -translate-x-1/2 bg-indigo-500" />
      <button
        type="button"
        aria-label="Tanlangan guruhni aylantirish"
        title="Aylantirish"
        className="pointer-events-auto absolute left-1/2 -bottom-10 flex h-5 w-5 -translate-x-1/2 items-center justify-center rounded-full border-2 border-indigo-500 bg-white text-indigo-500 shadow-md cursor-grab active:cursor-grabbing"
        onPointerDown={onBeginGroupRotate}
        onPointerMove={onTransformGroupRotate}
        onPointerUp={onFinishGroupRotate}
        onPointerCancel={onFinishGroupRotate}
      >
        <RotateCw size={11} />
      </button>
    </div>
  );
}
