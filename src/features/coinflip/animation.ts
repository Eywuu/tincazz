import { setTimeout as sleep } from 'node:timers/promises';
import { container } from '@sapphire/framework';
import type { ContainerBuilder } from 'discord.js';
import { cardReply } from '../ui/index.js';
import { flipAnimation } from './config.js';

declare module '@sapphire/pieces' {
  interface Container {
    /** Overrides `flipAnimation.frameMs` (tests set 0). */
    coinflipFrameMs?: number;
  }
}

type CardReply = ReturnType<typeof cardReply>;

export interface FlipDisplay {
  /** Shows the first card, answering the interaction. */
  first: (reply: CardReply) => Promise<unknown>;
  /** Replaces the card shown so far. */
  next: (reply: CardReply) => Promise<unknown>;
}

// Held on the container so every loaded copy of this module (pieces included) sees the override.
export function setFrameDelay(ms: number | undefined): void {
  container.coinflipFrameMs = ms;
}

const frameDelay = () => container.coinflipFrameMs ?? flipAnimation.frameMs;

/**
 * Shows the flipping frames one edit at a time, then the result. The coins have already moved, so
 * a frame that fails to show only cuts the animation short; errors from the first card or the
 * result propagate for the caller to fall back on.
 */
export async function animate(
  display: FlipDisplay,
  frames: readonly ContainerBuilder[],
  result: ContainerBuilder,
): Promise<unknown> {
  const [opening, ...rest] = frames;
  if (opening === undefined) {
    return display.first(cardReply(result));
  }
  await display.first(cardReply(opening));
  for (const frame of rest) {
    await sleep(frameDelay());
    try {
      await display.next(cardReply(frame));
    } catch (error) {
      container.logger.warn(
        `coinflip: cutting a flip animation short: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      break;
    }
  }
  await sleep(frameDelay());
  return display.next(cardReply(result));
}
