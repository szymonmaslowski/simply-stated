export const omit = <O extends Record<string, unknown>, K extends keyof O>(
  object: O,
  ...keys: K[]
): Omit<O, K> => {
  const rest = { ...object };
  for (const key of keys) {
    delete rest[key];
  }
  return rest;
};
