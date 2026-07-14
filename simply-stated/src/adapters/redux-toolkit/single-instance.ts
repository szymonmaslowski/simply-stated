import type { SliceSelectors } from '@reduxjs/toolkit';
import { getAtPath, setAtPath, splitPath } from '../../path';
import type { AnyMachine } from '../../simply-stated';
import { rebindUserSelectors } from './shared';
import type {
  EventPayload,
  GenericReducer,
  NestAt,
  StateOfMachine,
} from './shared';

type EventReducers<Machine extends AnyMachine, SliceState> = {
  [K in keyof Machine['event']]: GenericReducer<
    SliceState,
    EventPayload<Machine['event'][K]>
  >;
};

export const toSliceOptions = <
  Machine extends AnyMachine,
  State extends StateOfMachine<Machine>,
  NestingPath extends string | undefined = undefined,
  Selectors extends SliceSelectors<State> = Record<never, never>,
>(
  machine: Machine,
  {
    initialState,
    nestingPath = '',
    selectors: userSelectors,
  }: {
    initialState: NoInfer<State>;
    nestingPath?: NestingPath;
    selectors?: Selectors & SliceSelectors<State>;
  },
) => {
  type SliceState = NestAt<NestingPath, State>;

  const pathKeys = splitPath(nestingPath);

  const reducers = Object.fromEntries(
    Object.keys(machine.event).map(type => [
      type,
      (state, action) => {
        const nextState = machine.transition(
          getAtPath<State>(state, pathKeys),
          machine.event[type]!(action.payload),
        );
        return setAtPath(state, pathKeys, nextState);
      },
    ]),
  ) as EventReducers<Machine, SliceState>;

  const selectState = (state: SliceState) => getAtPath<State>(state, pathKeys);

  const selectors = rebindUserSelectors(
    userSelectors ?? ({} as Selectors & SliceSelectors<State>),
    selectState,
  );

  const sliceInitialState = setAtPath<SliceState>({}, pathKeys, initialState);

  return {
    initialState: sliceInitialState,
    reducers,
    selectors,
  };
};
