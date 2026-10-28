import { describe, expect, it } from 'vitest';
import {
  botFlipFrames,
  challengeFlipFrames,
  flipAnimation,
  flippingCard,
} from '../src/features/coinflip/index.js';

const json = (value: unknown) => JSON.stringify(value);

describe('flipping cards', () => {
  it('alternate sides and carry no buttons', () => {
    const even = json(flippingCard(0, 'caption'));
    const odd = json(flippingCard(1, 'caption'));
    expect(even).toContain('Heads…');
    expect(odd).toContain('Tails…');
    for (const text of [even, odd]) {
      expect(text).toContain('caption');
      expect(text).not.toContain('"type":1,');
    }
  });

  it('build one frame per configured step for bot flips and challenges', () => {
    const bot = botFlipFrames('1', { bet: 2_500, side: 'tails' });
    expect(bot).toHaveLength(flipAnimation.frames);
    expect(json(bot[0])).toContain('<@1> called **Tails** · 2,500');

    const challenge = challengeFlipFrames(
      { challengerId: '1', opponentId: undefined, bet: 100, side: 'heads', expiresAt: 0 },
      '3',
    );
    expect(challenge).toHaveLength(flipAnimation.frames);
    expect(json(challenge[0])).toContain('<@1> vs <@3> · 100 each');
  });
});
