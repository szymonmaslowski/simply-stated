import { describe, expect, it } from 'vitest';
import {
  combineStates,
  defineState,
  forwardEvents,
  is,
  type StateOf,
} from '../src';

const makeInner = () =>
  combineStates(defineState('X', 'Y')).createMachine(state => ({
    X: { y: (_, _payload: string) => state.Y() },
    Y: { x: () => state.X() },
  }));

describe('forwardEvents', () => {
  it('exposes a handler for every inner event', () => {
    const inner = makeInner();
    const { createMachine } = combineStates(
      defineState('Outer').withData<{
        innerState: StateOf<typeof inner.state>;
      }>(),
    );
    const { transition, event, state } = createMachine(s => ({
      Outer: forwardEvents(inner, s.Outer, data => data.innerState),
    }));

    expect(Object.keys(event).sort()).toEqual(['x', 'y']);

    const atY = transition(
      state.Outer({ innerState: inner.state.X() }),
      event.y('payload'),
    );
    expect(atY.data.innerState.name).toBe('Y');

    const backToX = transition(atY, event.x());
    expect(backToX.data.innerState.name).toBe('X');
  });

  it('writes back through a deep selector path', () => {
    const inner = makeInner();
    const { createMachine } = combineStates(
      defineState('Outer').withData<{
        nested: { innerState: StateOf<typeof inner.state> };
      }>(),
    );
    const { transition, event, state } = createMachine(s => ({
      Outer: forwardEvents(inner, s.Outer, data => data.nested.innerState),
    }));

    const next = transition(
      state.Outer({ nested: { innerState: inner.state.X() } }),
      event.y('payload'),
    );

    expect(next.data.nested.innerState.name).toBe('Y');
  });

  it('the embedded inner state works with is()', () => {
    const inner = makeInner();
    const { createMachine } = combineStates(
      defineState('Outer').withData<{
        innerState: StateOf<typeof inner.state>;
      }>(),
    );
    const { transition, event, state } = createMachine(s => ({
      Outer: forwardEvents(inner, s.Outer, data => data.innerState),
    }));

    const atY = transition(
      state.Outer({ innerState: inner.state.X() }),
      event.y('payload'),
    );
    expect(is(atY.data.innerState, inner.state.Y)).toBe(true);
    expect(is(atY.data.innerState, inner.state.X)).toBe(false);
  });
});

describe('handler reuse across outer states', () => {
  it('the same inner events drive independent outer states', () => {
    const inner = makeInner();
    const { createMachine } = combineStates(
      defineState('Aa', 'Ab').withData<{
        innerState: StateOf<typeof inner.state>;
      }>(),
    );
    const { transition, event, state } = createMachine(s => ({
      Aa: forwardEvents(inner, s.Aa, d => d.innerState),
      Ab: forwardEvents(inner, s.Ab, d => d.innerState),
    }));

    const fromAa = transition(
      state.Aa({ innerState: inner.state.X() }),
      event.y('payload'),
    );
    expect(fromAa.name).toBe('Aa');
    expect(fromAa.data.innerState.name).toBe('Y');

    const fromAb = transition(
      state.Ab({ innerState: inner.state.X() }),
      event.y('payload'),
    );
    expect(fromAb.name).toBe('Ab');
    expect(fromAb.data.innerState.name).toBe('Y');
  });
});
