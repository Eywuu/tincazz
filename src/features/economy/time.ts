export const dayMs = 86_400_000;

export function utcDay(now: number): number {
  return Math.floor(now / dayMs);
}
