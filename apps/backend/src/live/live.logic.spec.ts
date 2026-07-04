import { computePoints, isAnswerCorrect, generatePin, buildLeaderboard, makeTeamId, validateTeamsReady, TEAM_TYPES_WITH_SUGGESTIONS } from './live.logic';
import { LivePlayer, LiveTeam } from './live.types';

function makeTeam(id: string, captainUserId: string | null): LiveTeam {
  return { id, name: id, captainUserId, memberUserIds: new Set(), score: 0, answers: new Map(), suggestions: new Map() };
}

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

describe('makeTeamId', () => {
  it('formats sequential team ids', () => {
    expect(makeTeamId(1)).toBe('team-1');
    expect(makeTeamId(2)).toBe('team-2');
  });
});

describe('validateTeamsReady', () => {
  it('ready when every team has a captain and there are at least 2 teams', () => {
    const result = validateTeamsReady([makeTeam('team-1', 'u1'), makeTeam('team-2', 'u2')]);
    expect(result).toEqual({ ready: true, missingCaptainTeamIds: [] });
  });

  it('not ready with fewer than 2 teams', () => {
    const result = validateTeamsReady([makeTeam('team-1', 'u1')]);
    expect(result.ready).toBe(false);
  });

  it('lists teams missing a captain', () => {
    const result = validateTeamsReady([makeTeam('team-1', 'u1'), makeTeam('team-2', null)]);
    expect(result.ready).toBe(false);
    expect(result.missingCaptainTeamIds).toEqual(['team-2']);
  });
});

describe('TEAM_TYPES_WITH_SUGGESTIONS', () => {
  it('contains exactly the option-based types', () => {
    expect(TEAM_TYPES_WITH_SUGGESTIONS).toEqual(['single', 'multi', 'truefalse']);
  });
});
