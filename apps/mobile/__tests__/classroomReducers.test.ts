import {
  applyPdfSet,
  applyBoardSet,
  applyPageSet,
  applyStrokeAdd,
  applyStrokeUpdate,
  applyStrokeUndo,
  applyPageClear,
  moveStrokePoints,
  reorderStrokeList,
} from '../src/lib/classroomReducers';
import {CLASSROOM_INITIAL_STATE} from '../src/types/classroom';
import type {CsStroke} from '../src/types/classroom';

function stroke(id: string, points: number[] = [0.1, 0.1, 0.2, 0.2]): CsStroke {
  return {id, tool: 'pen', color: '#000', width: 4, points};
}

describe('moveStrokePoints', () => {
  it('shifts all points by the delta from the first point to the target', () => {
    const s = stroke('a', [0.1, 0.1, 0.3, 0.3]);
    const result = moveStrokePoints(s, 0.2, 0.2);
    expect(result).toEqual([0.2, 0.2, 0.4, 0.4]);
  });
});

describe('reorderStrokeList', () => {
  const list = [stroke('a'), stroke('b'), stroke('c')];

  it('moves selected strokes to the front', () => {
    const result = reorderStrokeList(list, ['a'], 'front');
    expect(result.map(s => s.id)).toEqual(['b', 'c', 'a']);
  });

  it('moves selected strokes to the back', () => {
    const result = reorderStrokeList(list, ['c'], 'back');
    expect(result.map(s => s.id)).toEqual(['c', 'a', 'b']);
  });

  it('moves a stroke one step forward', () => {
    const result = reorderStrokeList(list, ['a'], 'forward');
    expect(result.map(s => s.id)).toEqual(['b', 'a', 'c']);
  });

  it('moves a stroke one step backward', () => {
    const result = reorderStrokeList(list, ['c'], 'backward');
    expect(result.map(s => s.id)).toEqual(['a', 'c', 'b']);
  });
});

describe('applyPdfSet', () => {
  it('resets board mode to pdf single and clears strokes', () => {
    const result = applyPdfSet(CLASSROOM_INITIAL_STATE, {
      pdfName: 'lesson.pdf',
      pages: ['url1', 'url2'],
      currentPage: 1,
    });
    expect(result.pdfName).toBe('lesson.pdf');
    expect(result.pages).toEqual(['url1', 'url2']);
    expect(result.boardMode).toBe('pdf');
    expect(result.boardLayout).toBe('single');
    expect(result.strokesByPage).toEqual({});
  });
});

describe('applyBoardSet', () => {
  it('applies split layout with independent left/right modes', () => {
    const result = applyBoardSet(CLASSROOM_INITIAL_STATE, {
      mode: 'notebook',
      layout: 'split',
      leftMode: 'pdf',
      rightMode: 'notebook',
      currentPage: 2,
    });
    expect(result.boardLayout).toBe('split');
    expect(result.leftBoardMode).toBe('pdf');
    expect(result.rightBoardMode).toBe('notebook');
    expect(result.currentPage).toBe(2);
  });
});

describe('applyPageSet', () => {
  it('updates the current page and clears the pointer', () => {
    const state = {...CLASSROOM_INITIAL_STATE, pointer: {page: 1, x: 0.5, y: 0.5, active: true}};
    const result = applyPageSet(state, {page: 3});
    expect(result.currentPage).toBe(3);
    expect(result.pointer).toBeNull();
  });
});

describe('applyStrokeAdd', () => {
  it('adds a stroke to the given page', () => {
    const result = applyStrokeAdd(CLASSROOM_INITIAL_STATE, {page: 1, stroke: stroke('a')});
    expect(result.strokesByPage[1]).toHaveLength(1);
    expect(result.strokesByPage[1][0].id).toBe('a');
  });

  it('does not duplicate a stroke with an id that already exists', () => {
    const state = {...CLASSROOM_INITIAL_STATE, strokesByPage: {1: [stroke('a')]}};
    const result = applyStrokeAdd(state, {page: 1, stroke: stroke('a')});
    expect(result.strokesByPage[1]).toHaveLength(1);
  });

  it('adds to the right pane when pane is right', () => {
    const result = applyStrokeAdd(CLASSROOM_INITIAL_STATE, {page: 1, stroke: stroke('a'), pane: 'right'});
    expect(result.rightStrokesByPage[1]).toHaveLength(1);
    expect(result.strokesByPage[1]).toBeUndefined();
  });
});

describe('applyStrokeUpdate', () => {
  it('moves the stroke with the matching id', () => {
    const state = {...CLASSROOM_INITIAL_STATE, strokesByPage: {1: [stroke('a', [0.1, 0.1, 0.2, 0.2])]}};
    const result = applyStrokeUpdate(state, {page: 1, strokeId: 'a', x: 0.3, y: 0.3});
    expect(result.strokesByPage[1][0].points).toEqual([0.3, 0.3, 0.4, 0.4]);
  });
});

describe('applyStrokeUndo', () => {
  it('removes the stroke with the matching id', () => {
    const state = {...CLASSROOM_INITIAL_STATE, strokesByPage: {1: [stroke('a'), stroke('b')]}};
    const result = applyStrokeUndo(state, {page: 1, strokeId: 'a'});
    expect(result.strokesByPage[1].map(s => s.id)).toEqual(['b']);
  });
});

describe('applyPageClear', () => {
  it('empties the strokes list for the given page only', () => {
    const state = {...CLASSROOM_INITIAL_STATE, strokesByPage: {1: [stroke('a')], 2: [stroke('b')]}};
    const result = applyPageClear(state, {page: 1});
    expect(result.strokesByPage[1]).toEqual([]);
    expect(result.strokesByPage[2]).toHaveLength(1);
  });
});
