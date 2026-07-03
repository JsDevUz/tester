import { computePoints, isAnswerCorrect, generatePin, buildLeaderboard } from './live.logic';
import { LivePlayer } from './live.types';

function makePlayer(userId: string, name: string, score: number): LivePlayer {
  return { userId, name, socketId: null, score, answers: new Map() };
}

describe('computePoints', () => {
  it('darhol javob uchun ~1000 ball', () => {
    expect(computePoints(true, 0, 30000)).toBe(1000);
  });

  it('oxirgi soniyada ~500 ball', () => {
    expect(computePoints(true, 30000, 30000)).toBe(500);
  });

  it('yarmida ~750 ball', () => {
    expect(computePoints(true, 15000, 30000)).toBe(750);
  });

  it('notogri javob 0 ball', () => {
    expect(computePoints(false, 0, 30000)).toBe(0);
  });

  it('elapsed max dan oshsa ham 500 dan tushmaydi', () => {
    expect(computePoints(true, 35000, 30000)).toBe(500);
  });
});

describe('isAnswerCorrect', () => {
  it('single: togri variant', () => {
    expect(isAnswerCorrect(['a'], ['a'])).toBe(true);
  });

  it('single: notogri variant', () => {
    expect(isAnswerCorrect(['a'], ['b'])).toBe(false);
  });

  it('multi: toplam aynan teng bolsa togri', () => {
    expect(isAnswerCorrect(['a', 'b'], ['b', 'a'])).toBe(true);
  });

  it('multi: yetishmasa notogri', () => {
    expect(isAnswerCorrect(['a', 'b'], ['a'])).toBe(false);
  });

  it('multi: ortiqcha bolsa notogri', () => {
    expect(isAnswerCorrect(['a'], ['a', 'b'])).toBe(false);
  });

  it('correct bosh bolsa false', () => {
    expect(isAnswerCorrect([], [])).toBe(false);
  });
});

describe('generatePin', () => {
  it('6 xonali raqam qaytaradi', () => {
    const pin = generatePin(new Set());
    expect(pin).toMatch(/^\d{6}$/);
  });

  it('band PIN ni qaytarmaydi', () => {
    // 100000-999999 oraligida faqat bitta bosh qoldirub tekshirish real emas,
    // shuning uchun kichik taken set bilan 50 marta urinib kolliziya yoqligini tekshiramiz
    const taken = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const pin = generatePin(taken);
      expect(taken.has(pin)).toBe(false);
      taken.add(pin);
    }
  });
});

describe('buildLeaderboard', () => {
  it('ball boyicha kamayish tartibida rank beradi', () => {
    const lb = buildLeaderboard([
      makePlayer('u1', 'Ali', 500),
      makePlayer('u2', 'Vali', 1500),
      makePlayer('u3', 'Soli', 1000),
    ]);
    expect(lb.map((e) => e.name)).toEqual(['Vali', 'Soli', 'Ali']);
    expect(lb.map((e) => e.rank)).toEqual([1, 2, 3]);
  });
});
