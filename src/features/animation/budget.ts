import { container } from '@sapphire/framework';
import { animation } from './config.js';

interface Bucket {
  tokens: number;
  at: number;
}

declare module '@sapphire/pieces' {
  interface Container {
    /** Frame tokens left per channel, refilled continuously. Lost on restart. */
    animationBudgets?: Map<string, Bucket>;
  }
}

// Held on the container so every loaded copy of this module (pieces included) shares one state.
const buckets = (): Map<string, Bucket> => {
  container.animationBudgets ??= new Map();
  return container.animationBudgets;
};

/**
 * Spends one frame token of the channel's bucket: false when it is empty, so the caller should
 * skip that frame. Tokens refill continuously (`capacity` per `refillMs`) up to `capacity`.
 */
export function takeFrame(channelId: string, now: number = Date.now()): boolean {
  const { capacity, refillMs } = animation.budget;
  const map = buckets();
  const bucket = map.get(channelId) ?? { tokens: capacity, at: now };
  const elapsed = Math.max(0, now - bucket.at);
  const tokens = Math.min(capacity, bucket.tokens + (capacity * elapsed) / refillMs);
  if (tokens < 1) {
    map.set(channelId, { tokens, at: now });
    return false;
  }
  map.set(channelId, { tokens: tokens - 1, at: now });
  return true;
}

export function clearBudgets(): void {
  buckets().clear();
}
