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

type DataFromCreator<StateCreator extends AnyStateCreator> =
  Parameters<StateCreator>[0];

type EventNameOfMachine<Machine extends AnyMachine> = keyof Machine['event'] &
  string;

const writeNestedState = (
  outerStateCreator: AnyStateCreator,
  data: unknown,
  path: string[],
  nextNestedState: unknown,
) => outerStateCreator(setAtPath(data, path, nextNestedState));

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
    return writeNestedState(outerStateCreator, data, path, nextNestedState);
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

type EscapesSubset<Machine extends AnyMachine, InnerSubset, EventObject> = [
  InnerSubset extends unknown
    ? NarrowedTransition<TreeOf<Machine>, InnerSubset, EventObject>
    : never,
] extends [InnerSubset]
  ? false
  : true;

type ForwardedEventProperty<
  Machine extends AnyMachine,
  InnerSubset,
  OuterStateCreator extends AnyStateCreator,
  EventName extends EventNameOfMachine<Machine>,
> =
  EscapesSubset<
    Machine,
    InnerSubset,
    ReturnType<Machine['event'][EventName]>
  > extends true
    ? ApiError<`Forwarding '${EventName}' can store an inner state outside the declared inner data`>
    : ForwardedEventHandler<Machine, EventName, OuterStateCreator>;

type ForwardedHandlers<
  Machine extends AnyMachine,
  InnerSubset,
  OuterStateCreator extends AnyStateCreator,
> = {
  [EventName in EventNameOfMachine<Machine>]: ForwardedEventProperty<
    Machine,
    InnerSubset,
    OuterStateCreator,
    EventName
  >;
};

export const forwardEvents = <
  Machine extends AnyMachine,
  OuterStateCreator extends AnyStateCreator,
  InnerSubset extends StateOf<Machine['state']>,
>(
  innerMachine: Machine,
  outerStateCreator: OuterStateCreator,
  selector: (data: DataFromCreator<OuterStateCreator>) => InnerSubset,
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
  ) as ForwardedHandlers<Machine, InnerSubset, OuterStateCreator>;
};
