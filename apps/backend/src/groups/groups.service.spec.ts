import { resolveUserRoleAfterCuratorChange, shouldBeCuratorRole } from './groups.service';

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

describe('resolveUserRoleAfterCuratorChange', () => {
  it('promotes a student to curator when they should be one', () => {
    expect(resolveUserRoleAfterCuratorChange('student', true)).toBe('curator');
  });

  it('demotes a curator back to student when no active curator membership remains', () => {
    expect(resolveUserRoleAfterCuratorChange('curator', false)).toBe('student');
  });

  it('makes no change when already in the correct state', () => {
    expect(resolveUserRoleAfterCuratorChange('curator', true)).toBeNull();
    expect(resolveUserRoleAfterCuratorChange('student', false)).toBeNull();
  });

  it('never demotes a teacher, even when their curator membership is removed', () => {
    expect(resolveUserRoleAfterCuratorChange('teacher', false)).toBeNull();
  });

  it('never promotes a teacher to curator, keeping their higher role', () => {
    expect(resolveUserRoleAfterCuratorChange('teacher', true)).toBeNull();
  });

  it('never changes a super admin either direction', () => {
    expect(resolveUserRoleAfterCuratorChange('super', true)).toBeNull();
    expect(resolveUserRoleAfterCuratorChange('super', false)).toBeNull();
  });
});
