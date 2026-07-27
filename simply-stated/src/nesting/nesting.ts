/* eslint-disable @typescript-eslint/no-explicit-any */

import { getAtPath, setAtPath } from '../path';
import type {
  AnyMachine,
  AnyStateCreator,
  ApiError,
  EventPayloadOf,
  NarrowedTransition,
  StateOf,
  TreeOf,
} from '../simply-stated';
import type { Join, UnionToTuple } from '../type-utils';

type DataFromCreator<StateCreator extends AnyStateCreator> =
  Parameters<StateCreator>[0];

type EventNameOfMachine<Machine extends AnyMachine> = keyof Machine['event'] &
  string;

const recordSelectorPath = (selector: (proxy: unknown) => unknown) => {
  const path: string[] = [];
  const proxy: unknown = new Proxy(
    {},
    {
      get(_, key) {
        if (typeof key === 'string') path.push(key);
        return proxy;
      },
    },
  );
  selector(proxy);
  return path;
};

const makeEventHandlerCreator =
  <Machine extends AnyMachine, OuterStateCreator extends AnyStateCreator>(
    innerMachine: Machine,
    outerStateCreator: OuterStateCreator,
    path: string[],
  ) =>
  (eventCreator: Machine['event'][string]) =>
  (data: DataFromCreator<OuterStateCreator>, payload: any) => {
    const currentNestedState = getAtPath(data, path);
    const nextNestedState = innerMachine.transition(
      currentNestedState,
      eventCreator(payload),
    );
    return outerStateCreator(setAtPath(data, path, nextNestedState));
  };

type ForwardedEventHandler<
  Machine extends AnyMachine,
  EventName extends EventNameOfMachine<Machine>,
  OuterStateCreator extends AnyStateCreator,
> = [EventPayloadOf<Machine['event'][EventName]>] extends [never]
  ? (data: DataFromCreator<OuterStateCreator>) => ReturnType<OuterStateCreator>
  : (
      data: DataFromCreator<OuterStateCreator>,
      payload: EventPayloadOf<Machine['event'][EventName]>,
    ) => ReturnType<OuterStateCreator>;

type UnexpectedTargetStates<
  Machine extends AnyMachine,
  ExpectedInnerState,
  EventObject,
> = Exclude<
  ExpectedInnerState extends unknown
    ? NarrowedTransition<TreeOf<Machine>, ExpectedInnerState, EventObject>
    : never,
  ExpectedInnerState
>;

type TransitionsToUnexpectedState<
  Machine extends AnyMachine,
  ExpectedInnerState,
  EventObject,
> = [UnexpectedTargetStates<Machine, ExpectedInnerState, EventObject>] extends [
  never,
]
  ? false
  : true;

type StateNamesOf<State> = State extends {
  name: infer Name extends string;
}
  ? Name
  : never;

type EventsAllowedByState<Machine extends AnyMachine, ExpectedInnerState> =
  StateNamesOf<ExpectedInnerState> extends infer StateName extends string
    ?
        | (StateName extends keyof TreeOf<Machine>
            ? keyof NonNullable<TreeOf<Machine>[StateName]> & string
            : never)
        | ('*' extends keyof TreeOf<Machine>
            ? keyof NonNullable<TreeOf<Machine>['*']> & string
            : never)
    : never;

type PresentStateNames<State> = Join<
  UnionToTuple<StateNamesOf<State>>,
  ', ',
  "'"
>;

type ForwardedHandlers<
  Machine extends AnyMachine,
  OuterStateCreator extends AnyStateCreator,
  ExpectedInnerState,
> = {
  [EventName in EventNameOfMachine<Machine>]: EventName extends EventsAllowedByState<
    Machine,
    ExpectedInnerState
  >
    ? TransitionsToUnexpectedState<
        Machine,
        ExpectedInnerState,
        ReturnType<Machine['event'][EventName]>
      > extends true
      ? ApiError<`Forwarded event '${EventName}' transitions to an unexpected inner state (${PresentStateNames<
          UnexpectedTargetStates<
            Machine,
            ExpectedInnerState,
            ReturnType<Machine['event'][EventName]>
          >
        >})`> &
          ((...args: any[]) => never)
      : ForwardedEventHandler<Machine, EventName, OuterStateCreator>
    : ApiError<`Forwarded event '${EventName}' is not handled by any inner state (${PresentStateNames<ExpectedInnerState>})`> &
        ((...args: any[]) => never);
};

export const forwardEvents = <
  Machine extends AnyMachine,
  OuterStateCreator extends AnyStateCreator,
  ExpectedInnerState extends StateOf<Machine['state']>,
>(
  innerMachine: Machine,
  outerStateCreator: OuterStateCreator,
  selector: (data: DataFromCreator<OuterStateCreator>) => ExpectedInnerState,
) => {
  const path = recordSelectorPath(selector);
  const createHandler = makeEventHandlerCreator(
    innerMachine,
    outerStateCreator,
    path,
  );

  return Object.fromEntries(
    Object.entries(innerMachine.event).map(([eventName, eventCreator]) => [
      eventName,
      createHandler(eventCreator as Machine['event'][string]),
    ]),
  ) as ForwardedHandlers<Machine, OuterStateCreator, ExpectedInnerState>;
};
