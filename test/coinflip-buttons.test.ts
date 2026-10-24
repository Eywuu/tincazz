import crypto from 'node:crypto';
import { syncBuiltinESMExports } from 'node:module';
import { container } from '@sapphire/framework';
import { Events, MessageFlags } from 'discord.js';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createClient } from '../src/client.js';
import { openDatabase } from '../src/db/index.js';
import { flips, pots } from '../src/db/schema.js';
import {
  clearChallenges,
  encodeChallengeId,
  encodeFlipAgainId,
  notYourChallenge,
  notYourFlip,
  scheduleExpiry,
} from '../src/features/coinflip/index.js';
import {
  debit,
  findWallet,
  getOrCreateWallet,
  startingBalance,
} from '../src/features/economy/index.js';
import { pot } from '../src/features/gamba/config.js';
import { testEnv } from './support/env.js';
import { makeButton } from './support/interaction.js';

// See gamba-command.test.ts: patch the real crypto.randomInt for natively loaded pieces.
function mockRandomInt(...values: number[]) {
  const spy = vi.spyOn(crypto, 'randomInt').mockReturnValue(values.at(-1) as never);
  for (const value of values.slice(0, -1).reverse()) {
    spy.mockReturnValueOnce(value as never);
  }
  syncBuiltinESMExports();
}

const json = (value: unknown) => JSON.stringify(value);
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('coinflip buttons', () => {
  let client: ReturnType<typeof createClient>;

  beforeAll(async () => {
    client = createClient(testEnv);
    await client.stores.load();
  });

  beforeEach(() => {
    container.db = openDatabase(':memory:');
    clearChallenges();
  });

  afterEach(() => {
    clearChallenges();
    vi.restoreAllMocks();
    syncBuiltinESMExports();
  });

  const flipCount = () => container.db.select().from(flips).all().length;
  const balance = (userId: string) => findWallet(container.db, '2', userId)?.balance;
  const potAmount = () => container.db.select().from(pots).get()?.amount;

  const challengeId = (
    action: 'accept' | 'decline' | 'cancel',
    extra: { opponentId?: string; expiresAt?: number; bet?: number } = {},
  ) =>
    encodeChallengeId({
      action,
      challengerId: '1',
      opponentId: 'opponentId' in extra ? extra.opponentId : '3',
      bet: extra.bet ?? 100,
      side: 'heads',
      expiresAt: extra.expiresAt ?? Date.now() + 60_000,
    });

  async function click(customId: string, userId: string, messageId = 'm1') {
    const interaction = makeButton(client, { customId, userId, messageId });
    client.emit(Events.InteractionCreate, interaction as never);
    await vi.waitFor(
      () =>
        expect(interaction.reply.mock.calls.length + interaction.update.mock.calls.length).toBe(1),
      { timeout: 2000 },
    );
    return interaction;
  }

  const drain = (userId: string, leave: number) => {
    getOrCreateWallet(container.db, '2', userId, 1);
    debit(container.db, {
      guildId: '2',
      userId,
      amount: startingBalance - leave,
      reason: 'bet',
      now: 2,
    });
  };

  describe('flip again', () => {
    const again = encodeFlipAgainId({ userId: '1', bet: 100, side: 'heads' });

    it('flips again for the owner', async () => {
      mockRandomInt(0);
      const interaction = await click(again, '1');

      expect(json(interaction.update.mock.calls[0])).toContain('+94');
      expect(flipCount()).toBe(1);
    });

    it('tells another user it is not their flip', async () => {
      const interaction = await click(again, '5');

      expect(json(interaction.reply.mock.calls[0])).toContain(notYourFlip);
      expect(flipCount()).toBe(0);
    });

    it('refuses with a funds error when the balance fell below the bet', async () => {
      drain('1', 50);
      const interaction = await click(again, '1');

      const [options] = interaction.reply.mock.calls[0] as unknown as [{ flags: number }];
      expect(json(options)).toContain('You have 50 coins');
      expect(options.flags & MessageFlags.Ephemeral).toBeTruthy();
      expect(interaction.update).not.toHaveBeenCalled();
      expect(flipCount()).toBe(0);
    });
  });

  describe('accept', () => {
    it('settles a targeted challenge for the opponent', async () => {
      mockRandomInt(1);
      getOrCreateWallet(container.db, '2', '1', 1);
      const interaction = await click(challengeId('accept'), '3');

      expect(json(interaction.update.mock.calls[0])).toContain('<@3> wins **194**');
      expect(balance('1')).toBe(startingBalance - 100);
      expect(balance('3')).toBe(startingBalance + 94);
      expect(potAmount()).toBe(pot.seed + 6);
      expect(flipCount()).toBe(1);
    });

    it('sends a third user away from a targeted challenge', async () => {
      const interaction = await click(challengeId('accept'), '4');

      expect(json(interaction.reply.mock.calls[0])).toContain(notYourChallenge);
      expect(flipCount()).toBe(0);
    });

    it('stops the challenger from accepting their own open challenge', async () => {
      const interaction = await click(challengeId('accept', { opponentId: undefined }), '1');

      expect(json(interaction.reply.mock.calls[0])).toContain(notYourChallenge);
      expect(flipCount()).toBe(0);
    });

    it('lets only the first of two acceptors take an open challenge', async () => {
      mockRandomInt(0);
      const id = challengeId('accept', { opponentId: undefined });
      await click(id, '3');
      const second = await click(id, '4');

      expect(json(second.reply.mock.calls[0])).toContain('Someone already took this challenge.');
      expect(flipCount()).toBe(1);
    });

    it('answers "already taken" after a restart and moves no coins', async () => {
      mockRandomInt(0);
      const id = challengeId('accept');
      await click(id, '3');
      const before = [balance('1'), balance('3'), potAmount()];
      clearChallenges();
      const again = await click(id, '3');

      expect(json(again.reply.mock.calls[0])).toContain('Someone already took this challenge.');
      expect([balance('1'), balance('3'), potAmount()]).toEqual(before);
      expect(flipCount()).toBe(1);
    });

    it('closes a challenge accepted past its expiry', async () => {
      const interaction = await click(
        challengeId('accept', { expiresAt: Date.now() - 5_000 }),
        '3',
      );

      expect(json(interaction.update.mock.calls[0])).toContain('Challenge expired.');
      expect(flipCount()).toBe(0);
    });

    it('keeps the challenge open when the acceptor cannot cover the stake', async () => {
      mockRandomInt(0);
      drain('3', 5);
      const id = challengeId('accept', { opponentId: undefined });
      const short = await click(id, '3');

      expect(json(short.reply.mock.calls[0])).toContain(
        'You need 100 coins to accept. You have 5.',
      );
      expect(short.update).not.toHaveBeenCalled();

      const funded = await click(id, '4');
      expect(json(funded.update.mock.calls[0])).toContain('wins');
      expect(flipCount()).toBe(1);
    });

    it('still expires the card after a short acceptor', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      try {
        drain('3', 5);
        const interaction = await click(challengeId('accept', { opponentId: undefined }), '3');
        // The id rounds the expiry up to the next whole second.
        await vi.advanceTimersByTimeAsync(61_000);

        expect(interaction.message.edit).toHaveBeenCalledTimes(1);
        expect(json(interaction.message.edit.mock.calls[0])).toContain('Challenge expired.');
      } finally {
        vi.useRealTimers();
      }
    });

    it('closes the card when the challenger can no longer cover the bet', async () => {
      drain('1', 50);
      const interaction = await click(challengeId('accept'), '3');

      expect(json(interaction.update.mock.calls[0])).toContain("can't cover the bet");
      expect(flipCount()).toBe(0);
    });

    it('does not overwrite an accepted challenge when the expiry timer fires', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      try {
        mockRandomInt(0);
        const onExpire = vi.fn(async () => undefined);
        scheduleExpiry('m1', 60_000, onExpire);
        await click(challengeId('accept'), '3');
        await vi.advanceTimersByTimeAsync(60_000);

        expect(onExpire).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('decline and cancel', () => {
    it('lets the opponent decline, then refuses an accept', async () => {
      const declined = await click(challengeId('decline'), '3');
      expect(json(declined.update.mock.calls[0])).toContain('<@3> declined.');

      const accepted = await click(challengeId('accept'), '3');
      expect(json(accepted.reply.mock.calls[0])).toContain('Someone already took this challenge.');
      expect(flipCount()).toBe(0);
    });

    it('lets the challenger cancel, then refuses an accept', async () => {
      const cancelled = await click(challengeId('cancel'), '1');
      expect(json(cancelled.update.mock.calls[0])).toContain('<@1> cancelled.');

      const accepted = await click(challengeId('accept'), '3');
      expect(json(accepted.reply.mock.calls[0])).toContain('Someone already took this challenge.');
    });

    it('does not let the wrong user decline or cancel', async () => {
      const decline = await click(challengeId('decline'), '1');
      expect(json(decline.reply.mock.calls[0])).toContain(notYourChallenge);
      const cancel = await click(challengeId('cancel'), '3', 'm2');
      expect(json(cancel.reply.mock.calls[0])).toContain(notYourChallenge);
    });
  });

  it('ignores ids it cannot decode', async () => {
    const interaction = makeButton(client, { customId: 'cf:accept:garbage', userId: '1' });
    client.emit(Events.InteractionCreate, interaction as never);
    await wait(100);

    expect(interaction.reply).not.toHaveBeenCalled();
    expect(interaction.update).not.toHaveBeenCalled();
  });
});
