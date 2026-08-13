import {getReactionAnimProps} from '../src/lib/stickerReactionAnim';

describe('getReactionAnimProps', () => {
  it('is deterministic for the same id', () => {
    const a = getReactionAnimProps('reaction-1');
    const b = getReactionAnimProps('reaction-1');
    expect(a).toEqual(b);
  });

  it('produces different values for different ids', () => {
    const a = getReactionAnimProps('reaction-1');
    const b = getReactionAnimProps('reaction-2');
    expect(a).not.toEqual(b);
  });

  it('keeps leftPct within the visible horizontal band', () => {
    for (const id of ['a', 'b', 'c', 'd', 'e']) {
      const {leftPct} = getReactionAnimProps(id);
      expect(leftPct).toBeGreaterThanOrEqual(4);
      expect(leftPct).toBeLessThanOrEqual(72);
    }
  });

  it('keeps duration within the expected float-up range', () => {
    const {durationMs} = getReactionAnimProps('x');
    expect(durationMs).toBeGreaterThanOrEqual(3200);
    expect(durationMs).toBeLessThanOrEqual(4000);
  });
});
