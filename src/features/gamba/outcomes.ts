export interface WeightedOutcome {
  emoji: string;
  weight: number;
}

export const cppEmoji = '<:cpp:1226477956541448194>';

export const gambaJackpotRoleId = '1561827731400822845';

// Weights sum to 21: six yt emojis at 3 each, python at 2, cpp at 1.
export const gambaOutcomes: readonly WeightedOutcome[] = [
  { emoji: '<:gamba4Head:1202741378161840239>', weight: 3 },
  { emoji: '<:gambaCry:1083000042547322930>', weight: 3 },
  { emoji: '<:gambaGrr:1098212404640358463>', weight: 3 },
  { emoji: '<:gambaNails:1082999569291423815>', weight: 3 },
  { emoji: '<:gambaRaa:1098212756810907729>', weight: 3 },
  { emoji: '<:gambaSpooked:1083000047051997264>', weight: 3 },
  { emoji: '<:python:1226479453039759410>', weight: 2 },
  { emoji: cppEmoji, weight: 1 },
];
