// Deterministic seeded shuffle, ported 1:1 from
// apps/frontend/src/components/test/TestTaker.tsx so that question/option
// ordering (seeded by submissionId) matches exactly what the web app and
// backend-side answer-order validation expect.
export function seededShuffle<T>(arr: T[], seed: string): T[] {
  const result = [...arr];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  for (let i = result.length - 1; i > 0; i--) {
    h = (Math.imul(1664525, h) + 1013904223) | 0;
    const j = Math.abs(h) % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

const ARABIC_RE = /[؀-ۿ]/;
export function isArabicText(text: string): boolean {
  return ARABIC_RE.test(text);
}

export const VIOLATION_REASON = "Taqiqlangan harakat aniqlanganligi sababli yakunlandi.";

export const draftKey = (submissionId: string) => `test-draft:${submissionId}`;

export const TYPE_BADGES: Record<string, {label: string; bg: string; fg: string}> = {
  single: {label: 'Yagona', bg: '#dbeafe', fg: '#2563eb'},
  multi: {label: "Ko'p tanlov", bg: '#ede9fe', fg: '#7c3aed'},
  open: {label: 'Ochiq', bg: '#f1f5f9', fg: '#64748b'},
  arrange: {label: 'Gap tuzish', bg: '#fef3c7', fg: '#d97706'},
  truefalse: {label: "To'g'ri/Noto'g'ri", bg: '#dcfce7', fg: '#16a34a'},
  reorder: {label: 'Tartibga solish', bg: '#ffedd5', fg: '#ea580c'},
  matching: {label: 'Moslashtirish', bg: '#ccfbf1', fg: '#0d9488'},
  fillblank: {label: "Bo'sh joy", bg: '#fce7f3', fg: '#db2777'},
  slider: {label: 'Slider', bg: '#cffafe', fg: '#0891b2'},
  droppin: {label: 'Drop Pin', bg: '#ecfccb', fg: '#65a30d'},
};

export function formatTime(s: number): string {
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
