import { resolveVisibleGroupIds } from './schools.service';

describe('resolveVisibleGroupIds', () => {
  const adminOwnedGroups = [{ id: 'g1', courseId: 'c1' }, { id: 'g2', courseId: 'c1' }, { id: 'g3', courseId: 'c2' }];

  it('returns all groups owned by the admin when caller is teacher', () => {
    const result = resolveVisibleGroupIds('teacher', adminOwnedGroups, []);
    expect(result.sort()).toEqual(['g1', 'g2', 'g3']);
  });

  it('returns all groups owned by the admin when caller is super', () => {
    const result = resolveVisibleGroupIds('super', adminOwnedGroups, []);
    expect(result.sort()).toEqual(['g1', 'g2', 'g3']);
  });

  it('returns only curator-assigned groups when caller is curator', () => {
    const result = resolveVisibleGroupIds('curator', adminOwnedGroups, ['g2']);
    expect(result).toEqual(['g2']);
  });

  it('returns an empty list for a curator assigned to no groups', () => {
    const result = resolveVisibleGroupIds('curator', adminOwnedGroups, []);
    expect(result).toEqual([]);
  });

  it('ignores curatorGroupIds not present in adminOwnedGroups (defense in depth)', () => {
    const result = resolveVisibleGroupIds('curator', adminOwnedGroups, ['g2', 'not-a-real-group']);
    expect(result).toEqual(['g2']);
  });
});
