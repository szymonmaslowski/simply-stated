export const splitPath = (path: string): string[] =>
  path === '' ? [] : path.split('.');

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object';

export const getAtPath = <Result>(source: unknown, keys: readonly string[]) =>
  keys.reduce(
    (value, key) => (isRecord(value) ? value[key] : undefined),
    source,
  ) as Result;

export const setAtPath = <Result>(
  target: unknown,
  keys: readonly string[],
  value: unknown,
): Result => {
  if (keys.length === 0) return value as Result;
  const [head, ...rest] = keys;
  const source = (target ?? {}) as Record<string, unknown>;
  return {
    ...source,
    [head as string]: setAtPath(
      source[head as string] as Record<string, unknown>,
      rest,
      value,
    ),
  } as Result;
};
