export const logKinds = ['economy', 'mod'] as const;
export type LogKind = (typeof logKinds)[number];
