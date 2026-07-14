import { shouldBeCuratorRole } from './groups.service';

describe('shouldBeCuratorRole', () => {
  it('returns false when there are no memberships', () => {
    expect(shouldBeCuratorRole([])).toBe(false);
  });

  it('returns false when all memberships are student role', () => {
    expect(shouldBeCuratorRole([{ role: 'student', removedAt: null }])).toBe(false);
  });

  it('returns true when at least one active curator membership exists', () => {
    expect(shouldBeCuratorRole([
      { role: 'student', removedAt: null },
      { role: 'curator', removedAt: null },
    ])).toBe(true);
  });

  it('ignores a curator membership that has been removed', () => {
    expect(shouldBeCuratorRole([
      { role: 'curator', removedAt: new Date('2026-01-01') },
    ])).toBe(false);
  });

  it('returns true when curator membership is active in one of several groups', () => {
    expect(shouldBeCuratorRole([
      { role: 'curator', removedAt: new Date('2026-01-01') },
      { role: 'curator', removedAt: null },
    ])).toBe(true);
  });
});
