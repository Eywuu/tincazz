export class EconomyError extends Error {}

export class InsufficientFundsError extends EconomyError {
  public constructor(
    public readonly balance: number,
    public readonly needed: number,
  ) {
    super(`Insufficient funds: balance ${balance}, needed ${needed}`);
  }
}

export class AlreadyClaimedError extends EconomyError {
  public constructor(public readonly nextAt: number) {
    super(`Already claimed, next claim at ${nextAt}`);
  }
}

export class NotEligibleError extends EconomyError {
  public constructor(public readonly balance: number) {
    super(`Not eligible with balance ${balance}`);
  }
}

export class CooldownError extends EconomyError {
  public constructor(public readonly availableAt: number) {
    super(`On cooldown until ${availableAt}`);
  }
}
