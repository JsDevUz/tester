import {maskUzPhone} from '../src/lib/phone';

describe('maskUzPhone', () => {
  it('formats raw digits into +998 XX XXX XX XX', () => {
    expect(maskUzPhone('998901234567')).toBe('+998 90 123 45 67');
  });

  it('strips non-digit characters before formatting', () => {
    expect(maskUzPhone('+998 (90) 123-45-67')).toBe('+998 90 123 45 67');
  });

  it('caps input at 9 significant digits after the country code', () => {
    expect(maskUzPhone('9989012345671234')).toBe('+998 90 123 45 67');
  });

  it('handles partial input', () => {
    expect(maskUzPhone('99890')).toBe('+998 90');
  });
});
