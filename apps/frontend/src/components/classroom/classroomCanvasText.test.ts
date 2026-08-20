// @vitest-environment jsdom
import { describe, expect, it, vi, beforeAll } from "vitest";
import { fitTextInShape } from "./classroomCanvasText";

// jsdom has no real text metrics, so width is approximated as 0.5em per character -- enough
// for the wrapping arithmetic these tests exercise.
beforeAll(() => {
  const ctx = {
    font: "400 16px Inter",
    measureText: (text: string) => {
      const size = parseFloat(ctx.font.match(/(\d+(?:\.\d+)?)px/)?.[1] ?? "16");
      return { width: text.length * size * 0.5 } as TextMetrics;
    },
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    ctx as unknown as CanvasRenderingContext2D,
  );
});

const base = {
  fontFamily: "Inter" as const,
  fontWeight: 400 as const,
  fontSize: 20,
};

describe("fitTextInShape", () => {
  it("keeps the font size and grows the shape when the text needs more lines", () => {
    const result = fitTextInShape({
      ...base,
      text: "one two three four five six seven eight",
      shapeWidth: 200,
      shapeHeight: 40,
      maxShapeHeight: 400,
    });

    expect(result.fontSize).toBe(20);
    expect(result.shapeHeight).toBeGreaterThan(40);
  });

  it("shrinks the font only once the shape cannot grow any further", () => {
    const result = fitTextInShape({
      ...base,
      text: "one two three four five six seven eight nine ten eleven twelve",
      shapeWidth: 200,
      shapeHeight: 60,
      // Pinned: no room to grow, so fitting has to come from the font size.
      maxShapeHeight: 60,
    });

    expect(result.fontSize).toBeLessThan(20);
    expect(result.shapeHeight).toBe(60);
  });

  it("never enlarges the font when the shape has room to spare", () => {
    const result = fitTextInShape({
      ...base,
      text: "short",
      shapeWidth: 600,
      shapeHeight: 400,
      maxShapeHeight: 400,
    });

    expect(result.fontSize).toBe(20);
  });

  it("leaves an empty shape untouched", () => {
    const result = fitTextInShape({
      ...base,
      text: "   ",
      shapeWidth: 100,
      shapeHeight: 50,
    });

    expect(result).toEqual({ fontSize: 20, shapeHeight: 50 });
  });

  it("stops shrinking at the minimum rather than vanishing", () => {
    const result = fitTextInShape({
      ...base,
      text: "a very long sentence ".repeat(40),
      shapeWidth: 100,
      shapeHeight: 30,
      maxShapeHeight: 30,
    });

    expect(result.fontSize).toBeGreaterThanOrEqual(8);
  });
});
