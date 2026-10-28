import { setTimeout as sleep } from 'node:timers/promises';
import { container } from '@sapphire/framework';
import type { ContainerBuilder } from 'discord.js';
import { cardReply } from '../ui/index.js';
import { takeFrame } from './budget.js';
import { animation } from './config.js';

declare module '@sapphire/pieces' {
  interface Container {
    /** Overrides `animation.frameMs` (tests set 0). */
    animationFrameMs?: number;
  }
}

export type CardReply = ReturnType<typeof cardReply>;

export interface Display {
  /** Shows the first card, answering the interaction or message. */
  first(reply: CardReply): Promise<unknown>;
  /** Replaces the card shown so far. */
  next(reply: CardReply): Promise<unknown>;
  /** Puts the result on the message by other means when `first` or the result edit failed. */
  fallback?(reply: CardReply): Promise<unknown>;
}

// Held on the container so every loaded copy of this module (pieces included) sees the override.
export function setFrameDelay(ms: number | undefined): void {
  container.animationFrameMs = ms;
}

const frameDelay = () => container.animationFrameMs ?? animation.frameMs;

const describe = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Shows the frames one edit at a time, then the result. The game has already settled, so a frame
 * that fails to show, or that the channel budget has no token for, only cuts the animation short.
 * If the first card or the result cannot be shown, the display's `fallback` puts the result on the
 * message; without one the error propagates for the caller.
 */
export async function play(
  display: Display,
  frames: readonly ContainerBuilder[],
  result: ContainerBuilder,
  options: { channelId: string },
): Promise<unknown> {
  const [opening, ...rest] = frames;
  try {
    if (opening === undefined) {
      return await display.first(cardReply(result));
    }
    await display.first(cardReply(opening));
    for (const frame of rest) {
      if (!takeFrame(options.channelId)) {
        break;
      }
      await sleep(frameDelay());
      try {
        await display.next(cardReply(frame));
      } catch (error) {
        container.logger.warn(`animation: cutting a frame short: ${describe(error)}`);
        break;
      }
    }
    await sleep(frameDelay());
    return await display.next(cardReply(result));
  } catch (error) {
    if (!display.fallback) {
      throw error;
    }
    container.logger.error(
      `animation: could not show the card, using the fallback: ${describe(error)}`,
    );
    return display.fallback(cardReply(result));
  }
}
