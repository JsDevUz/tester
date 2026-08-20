import { describe, expect, it } from "vitest";
import type { CsStroke } from "../api/classroom";
import type { ClassroomState } from "./useClassroomSession";
import { applyBoardRedo, applyBoardUndo, applyPageRemove, applyStrokeAdd } from "./classroomReducers";

function baseState(overrides: Partial<ClassroomState> = {}): ClassroomState {
  return {
    joined: true, error: null, ended: false,
    pdfName: "doc.pdf", pages: ["p1.png", "p2.png", "p3.png"], currentPage: 1,
    strokesByPage: {}, rightStrokesByPage: {}, participants: [], hostOnline: true, pointer: null,
    zoom: 1, rightZoom: 1, splitRatio: 0.5, notebookPageCount: 4, scroll: null, rightScroll: null,
    isFree: false, boardMode: "pdf", boardLayout: "single", leftBoardMode: "pdf", rightBoardMode: "pdf",
    isBoardOpen: false,
    classroomTheme: "light", notebookPageStyles: {}, notebookPageOrientations: {},
    ...overrides,
  };
}

function stroke(id: string): CsStroke {
  return { id, tool: "pen", color: "#000", width: 2, points: [0, 0, 1, 1] } as CsStroke;
}

describe("cross-mode undo ordering", () => {
  // Spec example: draw on PDF, switch to notebook, draw there, then press
  // Ctrl+Z twice — the notebook stroke (drawn LAST, regardless of mode)
  // must be undone FIRST, then the PDF stroke second. Undo order follows
  // the global action stack, not per-mode stacks.
  it("undoes the notebook stroke first, then the PDF stroke, on two sequential undos", () => {
    let s = baseState({ boardMode: "pdf" });

    // Draw a stroke on the PDF board (page 1).
    const pdfStroke = stroke("pdf-stroke-1");
    s = applyStrokeAdd(s, { page: 1, stroke: pdfStroke, mode: "pdf" });
    expect(s.strokesByPage[1]?.map((x) => x.id)).toEqual(["pdf-stroke-1"]);

    // Switch to notebook mode and draw a stroke there (page 1 of notebook,
    // same pane since this is a non-split single board).
    s = { ...s, boardMode: "notebook", leftBoardMode: "notebook", rightBoardMode: "notebook" };
    const notebookStroke = stroke("notebook-stroke-1");
    s = applyStrokeAdd(s, { page: 1, stroke: notebookStroke, mode: "notebook" });
    expect(s.strokesByPage[1]?.map((x) => x.id)).toEqual(["pdf-stroke-1", "notebook-stroke-1"]);

    // First Ctrl+Z: server's undo() pops the LAST entry off the global
    // stack, which is the notebook stroke:add. Its inverse removes it and
    // switches the client's current board back to "notebook" (the mode the
    // undone entry belongs to).
    s = applyBoardUndo(s, {
      mode: "notebook", page: 1, entryType: "stroke:add",
      before: null, after: { stroke: notebookStroke },
    });
    expect(s.strokesByPage[1]?.map((x) => x.id)).toEqual(["pdf-stroke-1"]);
    expect(s.boardMode).toBe("notebook");

    // Second Ctrl+Z: now the PDF stroke:add is undone, and the board mode
    // switches to "pdf" to match where that entry was created.
    s = applyBoardUndo(s, {
      mode: "pdf", page: 1, entryType: "stroke:add",
      before: null, after: { stroke: pdfStroke },
    });
    expect(s.strokesByPage[1]?.map((x) => x.id)).toEqual([]);
    expect(s.boardMode).toBe("pdf");
  });
});

describe("applyBoardUndo / applyBoardRedo — page:insert and page:remove regression", () => {
  // Regression test for the crash: undoing a page:insert dereferences
  // p.after (afterPageIndex), but applyBoardUndo only accepted/forwarded
  // `before`, hardcoding `after: null` — causing `p.after!.afterPageIndex`
  // to throw "Cannot read properties of null".
  it("undoing a page:insert (Ctrl+Z after adding a page) removes the inserted page without throwing", () => {
    const s = baseState({
      boardMode: "notebook", leftBoardMode: "notebook", rightBoardMode: "notebook",
      notebookPageCount: 5, currentPage: 3,
    });

    // The socket payload for board:undo on a page:insert entry carries
    // `after` (the data needed to redo/replay the insert), not `before`.
    const payload = {
      mode: "notebook" as const,
      page: 3,
      entryType: "page:insert",
      before: null as unknown,
      after: { afterPageIndex: 2, style: "grid" as const },
    };

    expect(() => applyBoardUndo(s, payload)).not.toThrow();
    const next = applyBoardUndo(s, payload);
    expect(next.notebookPageCount).toBe(4);
  });

  // Regression test for the crash: redoing a page:remove dereferences
  // p.before (pageIndex), but applyBoardRedo only accepted/forwarded
  // `after`, hardcoding `before: null` — causing `p.before!.pageIndex` to
  // throw "Cannot read properties of null".
  it("redoing a page:remove (undo page removal, then Ctrl+Shift+Z) re-removes the page without throwing", () => {
    const s = baseState({
      boardMode: "notebook", leftBoardMode: "notebook", rightBoardMode: "notebook",
      notebookPageCount: 5, currentPage: 2,
    });

    // The socket payload for board:redo on a page:remove entry carries
    // `before` (the snapshot needed to redo the removal), not `after`.
    const payload = {
      mode: "notebook" as const,
      page: 2,
      entryType: "page:remove",
      before: { pageIndex: 2, page: { notebookStyle: "grid" as const, strokes: [] } },
      after: null as unknown,
    };

    expect(() => applyBoardRedo(s, payload)).not.toThrow();
    const next = applyBoardRedo(s, payload);
    expect(next.notebookPageCount).toBe(4);
  });
});

describe("applyPageRemove — notebook page reindexing", () => {
  it("removes the selected page style and shifts following styles back", () => {
    const next = applyPageRemove(baseState({
      boardMode: "notebook",
      leftBoardMode: "notebook",
      notebookPageCount: 4,
      notebookPageStyles: { 1: "grid", 2: "lined", 3: "plain", 4: "grid" },
    }), { mode: "notebook", pageIndex: 2 });

    expect(next.notebookPageCount).toBe(3);
    expect(next.notebookPageStyles).toEqual({ 1: "grid", 2: "plain", 3: "grid" });
  });

  // Reported: draw on notebook page 1, delete that page, and the drawing turns up on the
  // page that took its place instead of being deleted with it.
  it("drops the removed page's strokes instead of shifting them onto the next page", () => {
    const next = applyPageRemove(baseState({
      boardMode: "notebook",
      leftBoardMode: "notebook",
      notebookPageCount: 3,
      strokesByPage: { 1: [stroke("a")], 2: [stroke("b")], 3: [stroke("c")] },
    }), { mode: "notebook", pageIndex: 1 });

    expect(next.notebookPageCount).toBe(2);
    expect(next.strokesByPage[1]?.map((x) => x.id)).toEqual(["b"]);
    expect(next.strokesByPage[2]?.map((x) => x.id)).toEqual(["c"]);
    expect(next.strokesByPage[3]).toBeUndefined();
  });

  // Split view with the same mode in both panes: the backend shifts the mode's strokes once,
  // but each pane renders from its own copy here. Reindexing only the pane the delete came
  // from left the other pane's strokes on the old page numbers.
  it("reindexes both panes when both are showing the mode being edited", () => {
    const next = applyPageRemove(baseState({
      boardMode: "notebook",
      leftBoardMode: "notebook",
      rightBoardMode: "notebook",
      boardLayout: "split",
      notebookPageCount: 3,
      strokesByPage: { 1: [stroke("L1")], 2: [stroke("L2")] },
      rightStrokesByPage: { 1: [stroke("R1")], 2: [stroke("R2")] },
    }), { mode: "notebook", pageIndex: 1, pane: "left" });

    expect(next.strokesByPage[1]?.map((x) => x.id)).toEqual(["L2"]);
    expect(next.rightStrokesByPage[1]?.map((x) => x.id)).toEqual(["R2"]);
    expect(next.rightStrokesByPage[2]).toBeUndefined();
  });

  it("leaves a pane alone when it is showing the other mode", () => {
    const next = applyPageRemove(baseState({
      boardMode: "notebook",
      leftBoardMode: "notebook",
      rightBoardMode: "pdf",
      boardLayout: "split",
      notebookPageCount: 3,
      strokesByPage: { 1: [stroke("N1")], 2: [stroke("N2")] },
      rightStrokesByPage: { 1: [stroke("P1")], 2: [stroke("P2")] },
    }), { mode: "notebook", pageIndex: 1, pane: "left" });

    expect(next.strokesByPage[1]?.map((x) => x.id)).toEqual(["N2"]);
    // The pdf pane's pages did not move, so neither should its strokes.
    expect(next.rightStrokesByPage[1]?.map((x) => x.id)).toEqual(["P1"]);
    expect(next.rightStrokesByPage[2]?.map((x) => x.id)).toEqual(["P2"]);
  });

  it("does the same for pdf pages", () => {
    const next = applyPageRemove(baseState({
      boardMode: "pdf",
      leftBoardMode: "pdf",
      pages: ["p1.png", "p2.png", "p3.png"],
      strokesByPage: { 1: [stroke("a")], 2: [stroke("b")], 3: [stroke("c")] },
    }), { mode: "pdf", pageIndex: 1 });

    expect(next.pages).toEqual(["p2.png", "p3.png"]);
    expect(next.strokesByPage[1]?.map((x) => x.id)).toEqual(["b"]);
    expect(next.strokesByPage[2]?.map((x) => x.id)).toEqual(["c"]);
    expect(next.strokesByPage[3]).toBeUndefined();
  });
});
