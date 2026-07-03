// Pure scoring for the live quiz — unit-testable, no runtime dependencies.

export const DEFAULT_TIME_LIMIT_SECS = 20;
export const DEFAULT_POINTS = 1000;

/**
 * Kahoot-style scoring: a wrong (or missing) answer scores 0; a correct answer
 * scores between 50% and 100% of the question's base points, scaled by how much
 * time was left when it was submitted. `msLeft`/`totalMs` describe the remaining
 * vs. total time at answer submission.
 */
export function scorePoints(
  chosen: number,
  correct: number,
  msLeft: number,
  totalMs: number,
  basePoints: number,
): number {
  if (chosen !== correct) return 0;
  const frac = totalMs > 0 ? Math.max(0, Math.min(1, msLeft / totalMs)) : 0;
  return Math.round(basePoints * (0.5 + 0.5 * frac));
}
