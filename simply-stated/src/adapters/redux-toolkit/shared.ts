import type { PayloadAction, SliceSelectors } from '@reduxjs/toolkit';
import type { Simplify } from 'type-fest';
import type {
  AnyMachine,
  ApiError,
  StateOf,
  PlainStateFromNative,
} from '../../simply-stated';

export type ReservedSelectors<Names extends string> = {
  [K in Names]?: ApiError<`'${K}' is a reserved selector name`>;
};

export type NativeStateOfMachine<Machine extends AnyMachine> = StateOf<
  Machine['state']
>;

export type PlainStateOfMachine<Machine extends AnyMachine> = Simplify<
  PlainStateFromNative<NativeStateOfMachine<Machine>>
>;

export type NestAt<Path extends string | undefined, Value> = Path extends string
  ? Path extends `${infer Head}.${infer Rest}`
    ? { [K in Head]: NestAt<Rest, Value> }
    : { [K in Path]: Value }
  : Value;

export type EventPayload<Event extends (...args: never[]) => unknown> =
  Parameters<Event> extends [infer P] ? P : never;

export type EventReducer<SliceState, Payload> = [Payload] extends [never]
  ? <S extends SliceState>(state: S) => S
  : <S extends SliceState>(state: S, action: PayloadAction<Payload>) => S;

export type RebindSelectors<SliceState, Selectors> = {
  [K in keyof Selectors]: Selectors[K] extends (
    state: never,
    ...args: infer Args
  ) => infer Result
    ? (state: SliceState, ...args: Args) => Result
    : never;
};

export const rebindUserSelectors = <SliceState, Projected, Selectors>(
  userSelectors: Selectors & SliceSelectors<Projected>,
  project: (state: SliceState) => Projected,
) =>
  Object.fromEntries(
    Object.entries(userSelectors).map(([key, selector]) => [
      key,
      (state: SliceState, ...args: never[]) =>
        selector(project(state), ...args),
    ]),
  ) as RebindSelectors<SliceState, Selectors>;

export const getAtPath = <R extends object>(obj: object, path: string) =>
  (path === ''
    ? obj
    : path.split('.').reduce((o, key) => o[key as keyof typeof o], obj)) as R;

export const setAtPath = <R extends object>(
  target: Record<string, unknown>,
  path: string,
  value: unknown,
) => {
  if (path === '') return value as R;

  const keys = path.split('.');
  const last = keys.pop()!;
  let cursor = target;
  for (const key of keys) {
    if (typeof cursor[key] !== 'object' || cursor[key] === null) {
      cursor[key] = {};
    }
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[last] = value;

  return target as R;
};
