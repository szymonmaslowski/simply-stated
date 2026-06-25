import { createSelector } from '@reduxjs/toolkit';
import type { SliceSelectors } from '@reduxjs/toolkit';
import type { Simplify } from 'type-fest';
import { toNativeState, toPlainState } from '../../simply-stated';
import type { AnyMachine, PlainStateFromNative } from '../../simply-stated';
import { getAtPath, setAtPath, rebindUserSelectors } from './shared';
import type {
  EventPayload,
  EventReducer,
  NativeStateOfMachine,
  NestAt,
  RebindSelectors,
} from './shared';

type EventReducers<Machine extends AnyMachine, SliceState> = {
  [K in keyof Machine['event']]: EventReducer<
    SliceState,
    EventPayload<Machine['event'][K]>
  >;
};

export const toSliceOptions = <
  Machine extends AnyMachine,
  NativeState extends NativeStateOfMachine<Machine>,
  NestingPath extends string | undefined = undefined,
  Selectors extends SliceSelectors<NativeState> = Record<never, never>,
>(
  machine: Machine,
  {
    initialState,
    nestingPath = '',
    selectors: userSelectors,
  }: {
    initialState: NoInfer<NativeState>;
    nestingPath?: NestingPath;
    selectors?: Selectors & SliceSelectors<NativeState>;
  },
) => {
  type PlainState = Simplify<PlainStateFromNative<NativeState>>;
  type SliceState = NestAt<NestingPath, PlainState>;

  const reducers = Object.fromEntries(
    Object.keys(machine.event).map(type => [
      type,
      (state, action) => {
        const nextState = machine.transition(
          getAtPath<NativeState>(state, nestingPath),
          machine.event[type]!(action.payload),
        );
        return setAtPath(state, nestingPath, toPlainState(nextState));
      },
    ]),
  ) as EventReducers<Machine, SliceState>;

  const selectNativeState = createSelector(
    (state: SliceState) => getAtPath<PlainState>(state, nestingPath),
    state => toNativeState(state) as NativeState,
  );

  const wrappedSelectors = rebindUserSelectors(
    userSelectors ?? {},
    selectNativeState,
  );

  const selectors = {
    selectNativeState,
    ...wrappedSelectors,
  } as Simplify<
    { selectNativeState: typeof selectNativeState } & RebindSelectors<
      SliceState,
      Selectors
    >
  >;

  const plainInitialState = toPlainState(initialState);
  let sliceInitialState = {} as SliceState;
  sliceInitialState = setAtPath(
    sliceInitialState,
    nestingPath,
    plainInitialState,
  );

  return {
    initialState: sliceInitialState as SliceState,
    reducers,
    selectors,
  };
};
