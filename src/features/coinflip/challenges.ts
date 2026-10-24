import { container } from '@sapphire/framework';

interface ChallengeState {
  closed: Set<string>;
  timers: Map<string, NodeJS.Timeout>;
}

declare module '@sapphire/pieces' {
  interface Container {
    /** Challenge messages already settled or closed, and their expiry timers. Lost on restart. */
    coinflipChallenges?: ChallengeState;
  }
}

// Held on the container so every loaded copy of this module (pieces included) shares one state.
const state = (): ChallengeState => {
  container.coinflipChallenges ??= { closed: new Set(), timers: new Map() };
  return container.coinflipChallenges;
};

function clearTimer(messageId: string): void {
  const { timers } = state();
  const timer = timers.get(messageId);
  if (timer) {
    clearTimeout(timer);
    timers.delete(messageId);
  }
}

/** Claims a challenge message: true only for the first caller. Also cancels its expiry timer. */
export function tryClose(messageId: string): boolean {
  const { closed } = state();
  if (closed.has(messageId)) {
    return false;
  }
  closed.add(messageId);
  clearTimer(messageId);
  return true;
}

/** Gives a claimed message back (an acceptor who could not cover the stake). Does not reschedule. */
export function reopen(messageId: string): void {
  state().closed.delete(messageId);
}

/** Runs `onExpire` after `delayMs` unless the challenge was closed first. Never throws. */
export function scheduleExpiry(
  messageId: string,
  delayMs: number,
  onExpire: () => Promise<unknown>,
): void {
  clearTimer(messageId);
  const timer = setTimeout(async () => {
    state().timers.delete(messageId);
    if (!tryClose(messageId)) {
      return;
    }
    try {
      await onExpire();
    } catch (error) {
      container.logger.warn(
        `coinflip: could not expire challenge ${messageId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }, delayMs);
  timer.unref();
  state().timers.set(messageId, timer);
}

export function clearChallenges(): void {
  for (const timer of state().timers.values()) {
    clearTimeout(timer);
  }
  state().timers.clear();
  state().closed.clear();
}
