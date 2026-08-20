import { describe, expect, it } from "vitest";
import {
  buildStitchedParts,
  locateInStitched,
  stitchedDurationMs,
} from "./useStitchedRecording";

const durations = { "a.mp4": 10_000, "b.mp4": 5_000, "c.mp4": 7_000 };

describe("buildStitchedParts", () => {
  it("lays parts end to end in part order", () => {
    const parts = buildStitchedParts(
      [
        { recordingUrl: "b.mp4", partNumber: 2 },
        { recordingUrl: "a.mp4", partNumber: 1 },
      ],
      durations,
    );

    expect(parts).toEqual([
      { url: "a.mp4", startMs: 0, durationMs: 10_000 },
      { url: "b.mp4", startMs: 10_000, durationMs: 5_000 },
    ]);
  });

  it("skips failed parts and parts with no file", () => {
    const parts = buildStitchedParts(
      [
        { recordingUrl: "a.mp4", partNumber: 1 },
        { recordingUrl: null, partNumber: 2 },
        { recordingUrl: "b.mp4", partNumber: 3, recordingStatus: "failed" },
        { recordingUrl: "c.mp4", partNumber: 4 },
      ],
      durations,
    );

    expect(parts.map((p) => p.url)).toEqual(["a.mp4", "c.mp4"]);
    expect(parts[1].startMs).toBe(10_000);
  });

  it("treats an unmeasured part as zero-length until its metadata loads", () => {
    const parts = buildStitchedParts(
      [
        { recordingUrl: "a.mp4", partNumber: 1 },
        { recordingUrl: "b.mp4", partNumber: 2 },
      ],
      { "a.mp4": 10_000 },
    );

    expect(parts[1]).toEqual({ url: "b.mp4", startMs: 10_000, durationMs: 0 });
  });

  it("returns nothing for an empty or missing list", () => {
    expect(buildStitchedParts([], durations)).toEqual([]);
    expect(buildStitchedParts(undefined, durations)).toEqual([]);
  });
});

describe("stitchedDurationMs", () => {
  it("sums the parts", () => {
    const parts = buildStitchedParts(
      [
        { recordingUrl: "a.mp4", partNumber: 1 },
        { recordingUrl: "b.mp4", partNumber: 2 },
      ],
      durations,
    );

    expect(stitchedDurationMs(parts)).toBe(15_000);
  });

  it("is zero with no parts", () => {
    expect(stitchedDurationMs([])).toBe(0);
  });
});

describe("locateInStitched", () => {
  const parts = buildStitchedParts(
    [
      { recordingUrl: "a.mp4", partNumber: 1 },
      { recordingUrl: "b.mp4", partNumber: 2 },
    ],
    durations,
  );

  it("finds a time inside the first part", () => {
    expect(locateInStitched(parts, 3_000)).toMatchObject({ index: 0, offsetMs: 3_000 });
  });

  it("crosses into the second part", () => {
    expect(locateInStitched(parts, 12_000)).toMatchObject({ index: 1, offsetMs: 2_000 });
  });

  it("puts the boundary at the start of the next part", () => {
    expect(locateInStitched(parts, 10_000)).toMatchObject({ index: 1, offsetMs: 0 });
  });

  it("clamps past the end to the last part rather than giving up", () => {
    expect(locateInStitched(parts, 99_000)).toMatchObject({ index: 1 });
  });

  it("returns null when there are no parts", () => {
    expect(locateInStitched([], 0)).toBeNull();
  });
});
