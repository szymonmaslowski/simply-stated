import { configureStore, createSlice } from '@reduxjs/toolkit';
import { describe, expect, it } from 'vitest';
import {
  combineStates,
  defineState,
  forwardEvents,
  is,
  type StateOf,
} from '../../src';
import { toSliceOptions } from '../../src/adapters/redux-toolkit';

const makeInner = () =>
  combineStates(defineState('X', 'Y')).createMachine(state => ({
    X: { y: (_, _payload: string) => state.Y() },
    Y: { x: () => state.X() },
  }));

const setup = () => {
  const inner = makeInner();
  const outer = combineStates(
    defineState('Outer').withData<{
      innerState: StateOf<typeof inner.state>;
    }>(),
  ).createMachine(state => ({
    Outer: forwardEvents(inner, state.Outer, data => data.innerState),
  }));

  const slice = createSlice({
    name: 'outer',
    ...toSliceOptions(outer, {
      initialState: outer.state.Outer({ innerState: inner.state.X() }),
      selectors: { selectState: state => state },
    }),
  });
  const store = configureStore({ reducer: { outer: slice.reducer } });
  return { inner, outer, slice, store };
};

describe('nesting through toSliceOptions', () => {
  it('a forwarded event advances the embedded inner machine across a store round-trip', () => {
    const { slice, store } = setup();
    store.dispatch(slice.actions.y('payload'));
    expect(store.getState().outer.data.innerState.name).toBe('Y');
    store.dispatch(slice.actions.x());
    expect(store.getState().outer.data.innerState.name).toBe('X');
  });

  it('stores fully plain, serialisable state', () => {
    const { slice, store } = setup();
    store.dispatch(slice.actions.y('payload'));

    const stored = store.getState().outer;
    expect(JSON.parse(JSON.stringify(stored))).toEqual(stored);
  });

  it('selectState reads the outer state; is() narrows outer and embedded inner', () => {
    const { inner, outer, slice, store } = setup();
    store.dispatch(slice.actions.y('payload'));

    const state = slice.selectors.selectState(store.getState());
    expect(is(state, outer.state.Outer)).toBe(true);
    expect(state.data.innerState.name).toBe('Y');
    expect(is(state.data.innerState, inner.state.Y)).toBe(true);
    expect(is(state.data.innerState, inner.state.X)).toBe(false);
  });
});
