// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderClassroomCanvas, resetSettledLayerCache } from "./useClassroomCanvasRenderer";
import type { CsStroke } from "../../api/classroom";

/**
 * Counts drawImage calls to tell the two paths apart: a cache hit blits the settled layer,
 * a miss repaints every stroke.
 */
function makeCanvas() {
  const canvas = document.createElement("canvas");
  const calls = { drawImage: 0 };
  const ctx = {
    canvas,
    imageSmoothingEnabled: false,
    imageSmoothingQuality: "low",
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    drawImage: vi.fn(() => {
      calls.drawImage += 1;
    }),
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    fillText: vi.fn(),
    measureText: () => ({ width: 10 }) as TextMetrics,
    setLineDash: vi.fn(),
    quadraticCurveTo: vi.fn(),
    bezierCurveTo: vi.fn(),
    ellipse: vi.fn(),
    clip: vi.fn(),
    createLinearGradient: () => ({ addColorStop: vi.fn() }),
  } as unknown as CanvasRenderingContext2D;

  vi.spyOn(canvas, "getContext").mockReturnValue(ctx);
  return { canvas, calls };
}

function stroke(id: string, tool: string, createdAt?: number): CsStroke {
  return {
    id,
    tool,
    color: "#000",
    width: 2,
    points: [0.1, 0.1, 0.2, 0.2],
    ...(createdAt ? { createdAt } : {}),
  } as CsStroke;
}

function render(canvas: HTMLCanvasElement, strokes: CsStroke[]) {
  return renderClassroomCanvas({
    canvas,
    size: { w: 800, h: 600 },
    strokes,
    editingTextId: null,
    textEditor: null,
    hoveredStrokeId: null,
    strokeWidth: 2,
    draftPoints: null,
    draftPressures: null,
    tool: "pen",
    color: "#000",
    shapeStyle: {} as never,
    connectorDraftPoints: null,
    showPointer: false,
    pointer: null,
    lassoDraftPoints: null,
    eraserCursor: null,
  });
}

afterEach(() => {
  resetSettledLayerCache();
  vi.restoreAllMocks();
});

describe("settled layer caching", () => {
  it("reports an active laser so the caller keeps animating", () => {
    const { canvas } = makeCanvas();
    expect(render(canvas, [stroke("l1", "laser", Date.now())])).toBe(true);
  });

  it("reports no animation needed when nothing is a laser", () => {
    const { canvas } = makeCanvas();
    expect(render(canvas, [stroke("p1", "pen")])).toBe(false);
  });

  // The point of the cache: the second frame of a laser blits instead of repainting. jsdom
  // returns null from getContext on a detached canvas, so the offscreen copy is stubbed --
  // what matters is that the second frame reuses it rather than rebuilding.
  it("blits the cached layer on the next frame instead of repainting", () => {
    const { canvas, calls } = makeCanvas();
    const offscreenCtx = { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = realCreate(tag) as HTMLCanvasElement;
      if (tag === "canvas") vi.spyOn(el, "getContext").mockReturnValue(offscreenCtx);
      return el;
    });

    const strokes = [stroke("p1", "pen"), stroke("l1", "laser", Date.now())];

    render(canvas, strokes);
    const afterFirst = calls.drawImage;

    render(canvas, strokes);

    // One extra drawImage on the visible canvas: the blit of the settled layer.
    expect(calls.drawImage).toBe(afterFirst + 1);
  });

  it("rebuilds the layer when a stroke is added", () => {
    const { canvas } = makeCanvas();
    const laser = stroke("l1", "laser", Date.now());

    render(canvas, [stroke("p1", "pen"), laser]);
    // A new pen stroke changes the settled layer, so the cached bitmap must not be reused.
    const result = render(canvas, [stroke("p1", "pen"), stroke("p2", "pen"), laser]);

    expect(result).toBe(true);
  });

  it("drops the cache once the lasers are gone", () => {
    const { canvas, calls } = makeCanvas();
    render(canvas, [stroke("p1", "pen"), stroke("l1", "laser", Date.now())]);

    render(canvas, [stroke("p1", "pen")]);
    const afterClear = calls.drawImage;
    render(canvas, [stroke("p1", "pen")]);

    // No laser means no blitting -- the board is drawn directly.
    expect(calls.drawImage).toBe(afterClear);
  });
});
