/**
 * Shared playback settings for every animated game: the pause between card edits, and the
 * per-channel token bucket that caps how many edits a channel can burn (Discord rate limits
 * message edits per channel, so many games at once would otherwise get throttled).
 */
export const animation = {
  frameMs: 700,
  budget: { capacity: 5, refillMs: 5_000 },
} as const;
