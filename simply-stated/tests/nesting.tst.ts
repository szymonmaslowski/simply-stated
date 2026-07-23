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
import type { ApiError } from '../src/simply-stated';

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

type LoadingFetch = StateOf<typeof fetchMachine.state, 'Fetching' | 'Failure'>;

test('a forwarded event that stays within the pinned subset is a handler', () => {
  const { createMachine } = combineStates(
    defineState('Loading').withData<{ fetchingState: LoadingFetch }>(),
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

test('a forwarded event that escapes the pinned subset is an ApiError property', () => {
  const { state } = combineStates(
    defineState('Loading').withData<{ fetchingState: LoadingFetch }>(),
  );
  const handlers = forwardEvents(
    fetchMachine,
    state.Loading,
    data => data.fetchingState,
  );
  expect(handlers.resolved).type.toBe<
    ApiError<`Forwarding 'resolved' can store an inner state outside the declared inner data`>
  >();
  expect(handlers.rejected).type.not.toBe<
    ApiError<`Forwarding 'rejected' can store an inner state outside the declared inner data`>
  >();
});

test('spreading a map whose events can escape the pinned subset is rejected', () => {
  const { createMachine } = combineStates(
    defineState('Loading').withData<{ fetchingState: LoadingFetch }>(),
  );
  createMachine(
    // @ts-expect-error is not assignable to parameter of type
    state => ({
      Loading: {
        ...forwardEvents(
          fetchMachine,
          state.Loading,
          data => data.fetchingState,
        ),
      },
    }),
  );
});
