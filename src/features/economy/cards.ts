import { accents, card, coins } from '../ui/index.js';

export const botsHaveNoWallets = "Bots don't have wallets.";

export function balanceCard(userId: string, wallet: { balance: number; rank: number } | undefined) {
  if (!wallet) {
    return card(accents.brand, '## Balance', `<@${userId}> hasn't played yet.`);
  }
  return card(
    accents.brand,
    '## Balance',
    `<@${userId}> has **${coins(wallet.balance)}** coins`,
    `-# Rank #${wallet.rank} by coins`,
  );
}
