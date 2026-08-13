export function getReactionAnimProps(id: string): {
  leftPct: number;
  swingX: number;
  durationMs: number;
  delayMs: number;
} {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  const r = (n: number) => ((Math.abs(hash * (n + 1) * 2654435761) >>> 0) % 1000) / 1000;

  const leftPct = 4 + r(1) * 68;
  const swingX = (r(2) - 0.5) * 60;
  const durationMs = (3.2 + r(4) * 0.8) * 1000;
  const delayMs = r(5) * 0.3 * 1000;

  return {leftPct, swingX, durationMs, delayMs};
}
