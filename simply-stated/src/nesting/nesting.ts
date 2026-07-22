/* eslint-disable @typescript-eslint/no-explicit-any */

import { getAtPath, setAtPath } from '../path';
import type {
  AnyMachine,
  AnyState,
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

type CollectionOf<Machine extends AnyMachine> = Record<
  string,
  StateOf<Machine['state']>
>;

type ElementOf<Collection> = Collection[keyof Collection];

// A collection-forwarded handler mirrors a `forwardEvents` handler but addresses
// one element by id, so the id is folded into the payload: `{ id }` for a
// payload-less inner event, `{ id, payload }` otherwise.
type CollectionEventPayload<
  Machine extends AnyMachine,
  EventName extends EventNameOfMachine<Machine>,
  Collection,
> = [EventPayloadOf<Machine['event'][EventName]>] extends [never]
  ? { id: keyof Collection }
  : {
      id: keyof Collection;
      payload: EventPayloadOf<Machine['event'][EventName]>;
    };

type CollectionForwardedProperty<
  Machine extends AnyMachine,
  Collection,
  OuterStateCreator extends AnyStateCreator,
  EventName extends EventNameOfMachine<Machine>,
> =
  EscapesSubset<
    Machine,
    ElementOf<Collection>,
    ReturnType<Machine['event'][EventName]>
  > extends true
    ? ApiError<`Forwarding '${EventName}' can store an inner state outside the declared element type`>
    : (
        data: DataFromCreator<OuterStateCreator>,
        payload: CollectionEventPayload<Machine, EventName, Collection>,
      ) => ReturnType<OuterStateCreator>;

type CollectionForwardedHandlers<
  Machine extends AnyMachine,
  Collection,
  OuterStateCreator extends AnyStateCreator,
> = {
  [EventName in EventNameOfMachine<Machine>]: CollectionForwardedProperty<
    Machine,
    Collection,
    OuterStateCreator,
    EventName
  >;
};

// A separate helper rather than folding collection support into `forwardEvents`
// (review item 4): the return shape can be discriminated at the type level from
// the selector, but the runtime handler cannot — a single-element write and an
// id-addressed collection write are different operations, and nothing in the
// recorded selector path tells them apart at call time. Keeping them separate
// avoids a runtime payload-shape sniff; the two share the Check A machinery.
export const forwardCollectionEvent = <
  Machine extends AnyMachine,
  OuterStateCreator extends AnyStateCreator,
  Collection extends CollectionOf<Machine>,
>(
  innerMachine: Machine,
  outerStateCreator: OuterStateCreator,
  selector: (data: DataFromCreator<OuterStateCreator>) => Collection,
) => {
  const path = recordSelectorPath(selector);

  const createHandler =
    (eventCreator: Machine['event'][string]) =>
    (data: DataFromCreator<OuterStateCreator>, payload: any) => {
      const collection = getAtPath<Record<string, AnyState>>(data, path);
      const currentElement = collection[payload.id];
      if (!currentElement) return outerStateCreator(data);

      const nextElement = innerMachine.transition(
        currentElement,
        eventCreator(payload.payload),
      );
      return writeNestedState(outerStateCreator, data, path, {
        ...collection,
        [payload.id]: nextElement,
      });
    };

  return Object.fromEntries(
    Object.entries(innerMachine.event).map(([eventName, eventCreator]) => [
      eventName,
      createHandler(eventCreator as Machine['event'][string]),
    ]),
  ) as CollectionForwardedHandlers<Machine, Collection, OuterStateCreator>;
};

type StatesOf<StateMap extends Record<string, AnyStateCreator>> = ReturnType<
  StateMap[keyof StateMap]
>;

type DataOf<StateMap extends Record<string, AnyStateCreator>> =
  StatesOf<StateMap> extends { data: infer Data } ? Data : never;

type TypeAtPath<
  Source,
  Path extends string,
> = Path extends `${infer Head}.${infer Rest}`
  ? Head extends keyof Source
    ? TypeAtPath<Source[Head], Rest>
    : never
  : Path extends keyof Source
    ? Source[Path]
    : never;

// `StateCollection<typeof machine.state>` → an id-keyed map of the machine's
// states; the optional dot-path names where each state's id lives in its data,
// keeping a literal-union id literal (`StateCollection<S, 'id'>`).
export type StateCollection<
  StateMap extends Record<string, AnyStateCreator>,
  IdPath extends string | undefined = undefined,
> = [IdPath] extends [string]
  ? Record<
      TypeAtPath<DataOf<StateMap>, IdPath> & PropertyKey,
      StatesOf<StateMap>
    >
  : Record<string, StatesOf<StateMap>>;
