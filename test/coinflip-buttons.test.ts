import crypto from 'node:crypto';
import { syncBuiltinESMExports } from 'node:module';
import { container } from '@sapphire/framework';
import { Events, MessageFlags } from 'discord.js';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createClient } from '../src/client.js';
import { openDatabase } from '../src/db/index.js';
import { flips, pots } from '../src/db/schema.js';
import { clearBudgets, setFrameDelay } from '../src/features/animation/index.js';
import {
  clearChallenges,
  encodeChallengeId,
  encodeFlipAgainId,
  flipAnimation,
  notYourChallenge,
  notYourFlip,
  scheduleExpiry,
} from '../src/features/coinflip/index.js';
import {
  adminAdjust,
  debit,
  findWallet,
  getOrCreateWallet,
  startingBalance,
} from '../src/features/economy/index.js';
import { pot } from '../src/features/gamba/config.js';
import { setLogChannel } from '../src/features/settings/store.js';
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

/** The result card, shown by the last edit once the flipping frames have played. */
async function flipResult(interaction: { editReply: { mock: { calls: unknown[][] } } }) {
  await vi.waitFor(() =>
    expect(interaction.editReply.mock.calls).toHaveLength(flipAnimation.frames),
  );
  return json(interaction.editReply.mock.calls.at(-1));
}

describe('coinflip buttons', () => {
  let client: ReturnType<typeof createClient>;

  beforeAll(async () => {
    client = createClient(testEnv);
    await client.stores.load();
  });

  beforeEach(() => {
    container.db = openDatabase(':memory:');
    clearChallenges();
    setFrameDelay(0);
    clearBudgets();
  });

  afterEach(() => {
    clearChallenges();
    setFrameDelay(undefined);
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

  describe('economy log', () => {
    it('logs an accepted 5,000 challenge once and a small one never', async () => {
      const send = vi.fn(async () => ({}));
      client.channels.cache.set('50', { id: '50', isSendable: () => true, send } as never);
      setLogChannel(container.db, '2', 'economy', '50', 1);
      for (const userId of ['1', '3']) {
        adminAdjust(container.db, {
          guildId: '2',
          userId,
          actorId: '9',
          action: 'give',
          amount: 5_000,
          reason: 'setup',
          now: 1,
        });
      }
      mockRandomInt(1);
      await click(challengeId('accept', { bet: 5_000 }), '3');
      await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));

      await click(challengeId('accept', { bet: 100 }), '3', 'm2');
      await wait(50);
      expect(send).toHaveBeenCalledTimes(1);
    });

    it('logs a 5,000 flip again once', async () => {
      const send = vi.fn(async () => ({}));
      client.channels.cache.set('50', { id: '50', isSendable: () => true, send } as never);
      setLogChannel(container.db, '2', 'economy', '50', 1);
      adminAdjust(container.db, {
        guildId: '2',
        userId: '1',
        actorId: '9',
        action: 'give',
        amount: 5_000,
        reason: 'setup',
        now: 1,
      });
      mockRandomInt(0);
      await click(encodeFlipAgainId({ userId: '1', bet: 5_000, side: 'heads' }), '1');
      await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    });
  });

  describe('flip again', () => {
    const again = encodeFlipAgainId({ userId: '1', bet: 100, side: 'heads' });

    it('flips again for the owner', async () => {
      mockRandomInt(0);
      const interaction = await click(again, '1');

      expect(json(interaction.update.mock.calls[0])).toContain('flipping');
      expect(await flipResult(interaction)).toContain('+94');
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

      expect(json(interaction.update.mock.calls[0])).toContain('<@1> vs <@3> · 100 each');
      expect(await flipResult(interaction)).toContain('<@3> wins **194**');
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
      expect(await flipResult(funded)).toContain('wins');
      expect(flipCount()).toBe(1);
    });

    it('still expires the card with the original handler after a short acceptor', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      try {
        drain('3', 5);
        const onExpire = vi.fn(async () => undefined);
        scheduleExpiry('m1', 600_000, onExpire);
        await click(challengeId('accept', { opponentId: undefined }), '3');
        // The id rounds the expiry up to the next whole second.
        await vi.advanceTimersByTimeAsync(61_000);

        expect(onExpire).toHaveBeenCalledTimes(1);
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

  describe('after a restart or a failed card update', () => {
    it('shows the result in a message edit when the card update fails', async () => {
      mockRandomInt(0);
      const interaction = makeButton(client, { customId: challengeId('accept'), userId: '3' });
      interaction.update.mockRejectedValueOnce(new Error('Service Unavailable'));
      const edit = vi.fn(async (_options: unknown) => ({}));
      interaction.message.edit = edit;
      const error = vi.spyOn(container.logger, 'error').mockImplementation(() => undefined);
      client.emit(Events.InteractionCreate, interaction as never);
      await vi.waitFor(() => expect(edit).toHaveBeenCalledTimes(1), { timeout: 2000 });

      expect(json(edit.mock.calls[0])).toContain('wins');
      expect(error).toHaveBeenCalled();
      expect(flipCount()).toBe(1);
    });

    it('shows a flip again result in a message edit when the card update fails', async () => {
      mockRandomInt(0);
      const interaction = makeButton(client, {
        customId: encodeFlipAgainId({ userId: '1', bet: 100, side: 'heads' }),
        userId: '1',
      });
      interaction.update.mockRejectedValueOnce(new Error('Service Unavailable'));
      const edit = vi.fn(async (_options: unknown) => ({}));
      interaction.message.edit = edit;
      vi.spyOn(container.logger, 'error').mockImplementation(() => undefined);
      client.emit(Events.InteractionCreate, interaction as never);
      await vi.waitFor(() => expect(edit).toHaveBeenCalledTimes(1), { timeout: 2000 });

      expect(json(edit.mock.calls[0])).toContain('Heads');
    });

    it('shows the result in a message edit when the final edit fails', async () => {
      mockRandomInt(0);
      const interaction = makeButton(client, { customId: challengeId('accept'), userId: '3' });
      interaction.editReply.mockImplementation(async (options: unknown) => {
        if (!json(options).includes('flipping')) throw new Error('Unknown Webhook');
      });
      const edit = vi.fn(async (_options: unknown) => ({}));
      interaction.message.edit = edit;
      vi.spyOn(container.logger, 'error').mockImplementation(() => undefined);
      client.emit(Events.InteractionCreate, interaction as never);
      await vi.waitFor(() => expect(edit).toHaveBeenCalledTimes(1), { timeout: 2000 });

      expect(json(edit.mock.calls[0])).toContain('wins');
      expect(flipCount()).toBe(1);
    });

    it('does not let a cancel or decline overwrite a settled challenge after a restart', async () => {
      mockRandomInt(0);
      await click(challengeId('accept'), '3');
      clearChallenges();
      const cancel = await click(challengeId('cancel'), '1');
      clearChallenges();
      const decline = await click(challengeId('decline'), '3');

      for (const interaction of [cancel, decline]) {
        expect(json(interaction.reply.mock.calls[0])).toContain('Someone already took this');
        expect(interaction.update).not.toHaveBeenCalled();
      }
    });

    it('does not rewrite a settled challenge as expired after a restart', async () => {
      mockRandomInt(0);
      const expiresAt = Date.now() + 60_000;
      await click(challengeId('accept', { expiresAt }), '3');
      clearChallenges();
      const late = await click(challengeId('accept', { expiresAt: Date.now() - 5_000 }), '3');

      expect(json(late.reply.mock.calls[0])).toContain('Someone already took this');
      expect(late.update).not.toHaveBeenCalled();
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
