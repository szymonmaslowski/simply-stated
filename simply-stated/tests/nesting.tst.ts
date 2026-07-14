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
