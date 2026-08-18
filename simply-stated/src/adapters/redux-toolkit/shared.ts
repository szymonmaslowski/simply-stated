import type { PayloadAction, SliceSelectors } from '@reduxjs/toolkit';
import type { EmptyObject, SetAtPath, Simplify } from '../../type-utils';

export type NestAt<Path extends string | undefined, Value> = SetAtPath<
  EmptyObject,
  Path extends string ? Path : '',
  Value
>;

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
