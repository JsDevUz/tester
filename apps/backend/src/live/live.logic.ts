import { LivePlayer, LeaderboardEntry, LiveTeam } from './live.types';

export const LIVE_TYPES = ['single', 'multi', 'truefalse'] as const;
export const TEAM_TYPES_WITH_SUGGESTIONS = ['single', 'multi', 'truefalse'] as const;

export function makeTeamId(n: number): string {
  return `team-${n}`;
}

export function validateTeamsReady(teams: LiveTeam[]): { ready: boolean; missingCaptainTeamIds: string[] } {
  const missingCaptainTeamIds = teams.filter((t) => !t.captainUserId).map((t) => t.id);
  const ready = teams.length >= 2 && missingCaptainTeamIds.length === 0;
  return { ready, missingCaptainTeamIds };
}
export const ALLOWED_TIMES = [10, 20, 30, 60];
export const REVEAL_MS = 4000;
export const SESSION_CLEANUP_MS = 60000;
export const HOST_GRACE_MS = 120000;

export function computePoints(isCorrect: boolean, elapsedMs: number, maxMs: number): number {
  if (!isCorrect) return 0;
  const remaining = Math.max(0, maxMs - elapsedMs);
  return Math.round(500 + 500 * (remaining / maxMs));
}

export function isAnswerCorrect(correctOptionIds: string[], selectedOptionIds: string[]): boolean {
  if (correctOptionIds.length === 0) return false;
  const correct = new Set(correctOptionIds);
  const selected = new Set(selectedOptionIds);
  return correct.size === selected.size && [...correct].every((id) => selected.has(id));
}

export function generatePin(taken: Set<string>): string {
  for (let i = 0; i < 1000; i++) {
    const pin = String(Math.floor(100000 + Math.random() * 900000));
    if (!taken.has(pin)) return pin;
  }
  throw new Error('PIN space exhausted');
}

export function buildLeaderboard(players: LivePlayer[]): LeaderboardEntry[] {
  return [...players]
    .sort((a, b) => b.score - a.score)
    .map((p, i) => ({ userId: p.userId, name: p.name, score: p.score, rank: i + 1 }));
}
