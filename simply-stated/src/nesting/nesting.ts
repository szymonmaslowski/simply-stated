/* eslint-disable @typescript-eslint/no-explicit-any */

import { getAtPath, setAtPath } from '../path';
import type {
  AnyMachine,
  AnyStateCreator,
  EventPayloadOf,
  StateOf,
} from '../simply-stated';

type DataFromCreator<StateCreator extends AnyStateCreator> =
  Parameters<StateCreator>[0];

type StateSelector<
  OuterStateCreator extends AnyStateCreator,
  Machine extends AnyMachine,
> = (data: DataFromCreator<OuterStateCreator>) => StateOf<Machine['state']>;

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

type ForwardedHandlers<
  Machine extends AnyMachine,
  OuterStateCreator extends AnyStateCreator,
> = {
  [EventName in EventNameOfMachine<Machine>]: ForwardedEventHandler<
    Machine,
    EventName,
    OuterStateCreator
  >;
};

export const forwardEvents = <
  Machine extends AnyMachine,
  OuterStateCreator extends AnyStateCreator,
>(
  innerMachine: Machine,
  outerStateCreator: OuterStateCreator,
  selector: StateSelector<OuterStateCreator, Machine>,
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
  ) as ForwardedHandlers<Machine, OuterStateCreator>;
};
