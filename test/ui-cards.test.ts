import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  MessageFlags,
} from 'discord.js';
import { describe, expect, it } from 'vitest';
import { balanceCard } from '../src/features/economy/cards.js';
import {
  accents,
  card,
  cardReply,
  coins,
  discordTime,
  errorReply,
  withoutActionRows,
} from '../src/features/ui/index.js';

const texts = (container: ReturnType<typeof card>) =>
  container.toJSON().components.map((component) => (component as { content: string }).content);

describe('card', () => {
  it('has the accent and one text display per text', () => {
    const container = card(accents.win, 'a', 'b');
    expect(container.toJSON().accent_color).toBe(accents.win);
    expect(texts(container)).toEqual(['a', 'b']);
  });
});

describe('cardReply', () => {
  it('sets the components v2 flag', () => {
    const reply = cardReply(card(accents.win, 'a'));
    expect(reply.flags).toBe(MessageFlags.IsComponentsV2);
    expect(reply.components).toHaveLength(1);
  });

  it('adds ephemeral on request', () => {
    expect(cardReply(card(accents.win, 'a'), { ephemeral: true }).flags).toBe(
      MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    );
  });

  it('errorReply is an ephemeral error card', () => {
    const reply = errorReply('nope');
    expect(reply.flags).toBe(MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral);
    expect(texts(reply.components[0] as ReturnType<typeof card>)).toEqual(['nope']);
    expect((reply.components[0] as ReturnType<typeof card>).toJSON().accent_color).toBe(
      accents.error,
    );
  });
});

describe('withoutActionRows', () => {
  it('keeps the text displays and the accent, and drops the action rows', () => {
    const container = card(accents.gold, 'a', 'b').addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setLabel('Go').setCustomId('go').setStyle(ButtonStyle.Secondary),
      ),
    );
    const stripped = withoutActionRows(container.toJSON());

    expect(stripped.toJSON().accent_color).toBe(accents.gold);
    expect(stripped.toJSON().components.map((component) => component.type)).toEqual([
      ComponentType.TextDisplay,
      ComponentType.TextDisplay,
    ]);
    expect(texts(stripped)).toEqual(['a', 'b']);
  });
});

describe('formatting', () => {
  it('groups coins', () => {
    expect(coins(1234567)).toBe('1,234,567');
  });

  it('formats a relative discord time', () => {
    expect(discordTime(1_700_000_000_999)).toBe('<t:1700000000:R>');
  });
});

describe('balanceCard', () => {
  it('shows balance and rank', () => {
    const container = balanceCard('1', { balance: 1050, rank: 2 });
    expect(container.toJSON().accent_color).toBe(accents.brand);
    expect(texts(container)).toEqual([
      '## Balance',
      '<@1> has **1,050** coins',
      '-# Rank #2 by coins',
    ]);
  });

  it('says so when there is no wallet', () => {
    expect(texts(balanceCard('1', undefined))).toEqual(['## Balance', "<@1> hasn't played yet."]);
  });
});
