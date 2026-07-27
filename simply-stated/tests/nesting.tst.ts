/**
 * Type-level tests for the machine-nesting helper.
 *
 * Positive inference of forwarded handlers and event creators, plus the
 * compile-time error surface (selector return type, payload typing). Never
 * executed at runtime.
 */

import { expect, test } from 'tstyche';
import {
  combineStates,
  defineState,
  forwardEvents,
  is,
  type StateOf,
} from '../src';

const innerMachine = combineStates(defineState('X', 'Y')).createMachine(
  state => ({
    X: { y: (_, _payload: string) => state.Y() },
    Y: { x: () => state.X() },
  }),
);

type InnerState = StateOf<typeof innerMachine.state>;

const outerMachine = combineStates(
  defineState('Outer').withData<{ innerState: InnerState }>(),
).createMachine(state => ({
  Outer: forwardEvents(innerMachine, state.Outer, d => d.innerState),
}));

test('the resulting outer state narrows to the embedded inner state', () => {
  const next = outerMachine.transition(
    outerMachine.state.Outer({ innerState: innerMachine.state.X() }),
    outerMachine.event.y('p'),
  );
  if (is(next, outerMachine.state.Outer)) {
    expect(next.data.innerState).type.toBe<InnerState>();
  }
});

test('forwardEvents exposes a handler per inner event with inferred payloads', () => {
  const handlers = forwardEvents(
    innerMachine,
    outerMachine.state.Outer,
    d => d.innerState,
  );
  expect(handlers.y).type.toBe<
    (
      data: { innerState: InnerState },
      payload: string,
    ) => StateOf<typeof outerMachine.state, 'Outer'>
  >();
  expect(handlers.x).type.toBe<
    (data: {
      innerState: InnerState;
    }) => StateOf<typeof outerMachine.state, 'Outer'>
  >();
});

test('selector must return the inner machine state', () => {
  combineStates(
    defineState('Outer').withData<{ innerState: InnerState; other: number }>(),
  ).createMachine(state => ({
    Outer: {
      // @ts-expect-error Type 'number' is not assignable to type
      ...forwardEvents(innerMachine, state.Outer, d => d.other),
    },
  }));
});

const fetchMachine = combineStates(
  defineState('Idle'),
  defineState('Fetching').withData<{ query: string }>(),
  defineState('Success').withData<{ query: string; value: string }>(),
  defineState('Failure').withData<{ query: string; error: string }>(),
).createMachine(state => ({
  Idle: { fetch: (_, payload: { query: string }) => state.Fetching(payload) },
  Fetching: {
    resolved: (data, value: string) => state.Success({ ...data, value }),
    rejected: (data, error: string) => state.Failure({ ...data, error }),
  },
  Success: { refetch: ({ query }) => state.Fetching({ query }) },
  Failure: { retry: ({ query }) => state.Fetching({ query }) },
}));

test('a forwarded event that stays within the pinned subset is a handler', () => {
  const { createMachine } = combineStates(
    defineState('Loading').withData<{
      fetchingState: StateOf<typeof fetchMachine.state, 'Fetching' | 'Failure'>;
    }>(),
  );
  createMachine(state => ({
    Loading: {
      searchFailed: forwardEvents(
        fetchMachine,
        state.Loading,
        data => data.fetchingState,
      ).rejected,
    },
  }));
});

test('a forwarded event no target state handles is a dead-forward error', () => {
  combineStates(
    defineState('Loading').withData<{
      fetchingState: StateOf<typeof fetchMachine.state, 'Fetching' | 'Failure'>;
    }>(),
  ).createMachine(state => ({
    Loading: {
      // @ts-expect-error ApiError<"Forwarded event 'refetch' is not handled by any inner state ('Fetching', 'Failure')">
      refetch: forwardEvents(fetchMachine, state.Loading, d => d.fetchingState)
        .refetch,
    },
  }));
});

test('spreading a map with a dead event is rejected at the state', () => {
  combineStates(
    defineState('Loading').withData<{
      fetchingState: StateOf<typeof fetchMachine.state, 'Fetching' | 'Failure'>;
    }>(),
  ).createMachine(state => ({
    // @ts-expect-error ApiError<"Forwarded event 'fetch' is not handled by any inner state ('Fetching', 'Failure')">
    Loading: {
      ...forwardEvents(fetchMachine, state.Loading, d => d.fetchingState),
    },
  }));
});

const linearMachine = combineStates(defineState('A', 'B', 'C')).createMachine(
  state => ({
    A: { toB: () => state.B() },
    B: { toC: () => state.C() },
    C: {},
  }),
);

test('an escaping forwarded event errors at the event slot', () => {
  combineStates(
    defineState('Outer').withData<{
      inner: StateOf<typeof linearMachine.state, 'A' | 'B'>;
    }>(),
  ).createMachine(state => ({
    Outer: {
      // @ts-expect-error ApiError<"Forwarded event 'toC' transitions to an unexpected inner state ('C')">
      toC: forwardEvents(linearMachine, state.Outer, d => d.inner).toC,
    },
  }));
});

test('spreading a map whose event escapes the pinned subset is rejected at the state', () => {
  combineStates(
    defineState('Outer').withData<{
      inner: StateOf<typeof linearMachine.state, 'A' | 'B'>;
    }>(),
  ).createMachine(state => ({
    // @ts-expect-error ApiError<"Forwarded event 'toC' transitions to an unexpected inner state ('C')">
    Outer: {
      ...forwardEvents(linearMachine, state.Outer, d => d.inner),
    },
  }));
});
