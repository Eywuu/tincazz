// No parameter properties: Node's strip-only TypeScript loader (used for pieces in tests) rejects them.
export class EconomyError extends Error {}

export class InsufficientFundsError extends EconomyError {
  public readonly balance: number;
  public readonly needed: number;

  public constructor(balance: number, needed: number) {
    super(`Insufficient funds: balance ${balance}, needed ${needed}`);
    this.balance = balance;
    this.needed = needed;
  }
}

export class AlreadyClaimedError extends EconomyError {
  public readonly nextAt: number;

  public constructor(nextAt: number) {
    super(`Already claimed, next claim at ${nextAt}`);
    this.nextAt = nextAt;
  }
}

export class NotEligibleError extends EconomyError {
  public readonly balance: number;

  public constructor(balance: number) {
    super(`Not eligible with balance ${balance}`);
    this.balance = balance;
  }
}

export class CooldownError extends EconomyError {
  public readonly availableAt: number;

  public constructor(availableAt: number) {
    super(`On cooldown until ${availableAt}`);
    this.availableAt = availableAt;
  }
}
