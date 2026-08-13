jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

import {isGuestEligible} from '../src/hooks/useClassroomSession';

describe('isGuestEligible', () => {
  it('is eligible when a token is present, regardless of guest name', () => {
    expect(isGuestEligible(true, undefined)).toBe(true);
    expect(isGuestEligible(true, 'Ali')).toBe(true);
  });

  it('is eligible when no token but a non-empty guest name was submitted', () => {
    expect(isGuestEligible(false, 'Ali')).toBe(true);
  });

  it('is not eligible when no token and no guest name', () => {
    expect(isGuestEligible(false, undefined)).toBe(false);
    expect(isGuestEligible(false, '')).toBe(false);
    expect(isGuestEligible(false, '   ')).toBe(false);
  });
});
