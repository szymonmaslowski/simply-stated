import type { PayloadAction, SliceSelectors } from '@reduxjs/toolkit';
import type { AnyMachine, StateOf } from '../../simply-stated';
import type { Simplify } from '../../type-utils';

export type StateOfMachine<Machine extends AnyMachine> = StateOf<
  Machine['state']
>;

export type NestAt<Path extends string | undefined, Value> = Path extends string
  ? Path extends `${infer Head}.${infer Rest}`
    ? { [K in Head]: NestAt<Rest, Value> }
    : { [K in Path]: Value }
  : Value;

export type GenericReducer<State, Payload> = [Payload] extends [never]
  ? <S extends State>(state: S) => S
  : <S extends State>(state: S, action: PayloadAction<Payload>) => S;

type RebindSelectors<SliceState, Selectors> = {
  [K in keyof Selectors]: Selectors[K] extends (
    state: never,
    ...args: infer Args
  ) => infer Result
    ? (state: SliceState, ...args: Args) => Result
    : never;
};

export const rebindUserSelectors = <SliceState, ProjectedState, Selectors>(
  userSelectors: Selectors & SliceSelectors<ProjectedState>,
  projectState: (state: SliceState) => ProjectedState,
) =>
  Object.fromEntries(
    Object.entries(userSelectors).map(([key, selector]) => [
      key,
      (state: SliceState, ...args: never[]) =>
        selector(projectState(state), ...args),
    ]),
  ) as Simplify<RebindSelectors<SliceState, Selectors>>;
