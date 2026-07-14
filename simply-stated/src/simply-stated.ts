/* eslint-disable @typescript-eslint/no-explicit-any */

import type {
  GetTagMetadata,
  IsAny,
  IsEqual,
  IsUnion,
  Simplify,
  Tagged,
  UnionToIntersection,
} from 'type-fest';

export type ApiError<M extends string> = {
  __message: M;
};

type StateDefinition<
  StateName extends string,
  Data extends NonNullable<unknown> | void = void,
> = Tagged<
  { stateName: StateName; withData: Data extends void ? false : true },
  'StateDefinition',
  Data
>;

type AnyStateDefinition = StateDefinition<string, any>;

type StateDefinitionsFor<
  StateNames extends readonly string[],
  Data extends NonNullable<unknown> | void = void,
> = {
  [SN in keyof StateNames]: StateNames[SN] extends string
    ? StateDefinition<StateNames[SN], Data>
    : never;
};

type DefineStateTuple<StateNames extends readonly string[]> =
  StateDefinitionsFor<StateNames> & {
    withData<Data extends NonNullable<unknown>>(): StateDefinitionsFor<
      StateNames,
      Data
    >;
  };

type StateObject<
  StateName extends string,
  Data extends NonNullable<unknown> | void = void,
> = Readonly<
  Data extends void ? { name: StateName } : { name: StateName; data: Data }
>;

type StateCreator<
  StateName extends string,
  Data extends NonNullable<unknown> | void,
> = (Data extends void
  ? () => StateObject<StateName>
  : (data: Data) => StateObject<StateName, Data>) & {
  stateName: StateName;
};

export type AnyStateCreator = StateCreator<string, any>;

type StateCreatorsFromDefinitions<
  Definitions extends readonly AnyStateDefinition[],
> = {
  [K in keyof Definitions]: Definitions[K] extends AnyStateDefinition
    ? Definitions[K] extends StateDefinition<infer Name extends string, any>
      ? StateCreator<Name, GetTagMetadata<Definitions[K], 'StateDefinition'>>
      : never
    : never;
};

type AsTuple<
  T extends readonly unknown[],
  R extends readonly unknown[] = [],
> = number extends T['length']
  ? T
  : R['length'] extends T['length']
    ? R
    : AsTuple<T, [...R, T[R['length']]]>;

type Flatten<
  T extends readonly unknown[],
  R extends readonly unknown[] = [],
> = T extends readonly [infer Head, ...infer Rest extends readonly unknown[]]
  ? Head extends readonly unknown[]
    ? Flatten<Rest, readonly [...R, ...AsTuple<Head>]>
    : Flatten<Rest, readonly [...R, Head]>
  : R;

type ValidateNoStar<StateNames extends readonly string[]> = {
  [SN in keyof StateNames]: StateNames[SN] extends '*'
    ? ApiError<`'*' is reserved for cross-state events`>
    : StateNames[SN];
};

export const is = <const StateCreators extends readonly AnyStateCreator[]>(
  state: { readonly name: string },
  ...stateCreators: StateCreators
): state is StateType<StateCreators> =>
  stateCreators.some(stateCreator => stateCreator.stateName === state.name);

const makeStateCreator = <Data extends NonNullable<unknown> | void>({
  stateName,
  withData,
}: StateDefinition<string, Data>) => {
  const stateCreator = withData
    ? (data: Data) => ({ name: stateName, data })
    : () => ({ name: stateName });

  return Object.assign(stateCreator, {
    stateName,
  });
};

export const defineState = <
  const StateNames extends readonly [string, ...string[]],
>(
  ...stateNames: ValidateNoStar<StateNames>
): DefineStateTuple<StateNames> => {
  if (stateNames.length === 0) {
    throw new Error('defineState requires at least one state name');
  }

  stateNames.forEach(sn => {
    if (sn !== '*') return;
    throw new Error("'*' is reserved for cross-state events");
  });

  const makeAllStateDefinitions = <
    Data extends NonNullable<unknown> | void = void,
  >(
    withData: boolean = false,
  ) =>
    stateNames.map(stateName => ({
      stateName,
      withData,
    })) as StateDefinitionsFor<StateNames, Data>;

  const tuple = makeAllStateDefinitions() as DefineStateTuple<StateNames>;
  tuple.withData = () => makeAllStateDefinitions(true);

  return tuple;
};

export type StateType<StateCreators extends readonly AnyStateCreator[]> =
  ReturnType<StateCreators[number]>;

type StateCreatorsMap<StateCreators extends readonly AnyStateCreator[]> =
  Simplify<{
    [SC in StateCreators[number] as SC['stateName']]: SC;
  }>;

type EventHandler<
  StateCreators extends readonly AnyStateCreator[],
  SC extends AnyStateCreator | void = void,
> = SC extends void
  ? (...payload: any) => StateType<StateCreators>
  : SC extends AnyStateCreator
    ? (
        data: ReturnType<SC> extends { data: infer D } ? D : undefined,
        ...payload: any
      ) => StateType<StateCreators>
    : never;

type StateMachineTree<StateCreators extends readonly AnyStateCreator[]> = {
  [SC in StateCreators[number] as SC['stateName']]: {
    [event: string]: EventHandler<StateCreators, SC>;
  };
} & {
  '*'?: {
    [event: string]: EventHandler<StateCreators>;
  };
};

type EventNames<Tree> = {
  [S in keyof Tree]: keyof NonNullable<Tree[S]>;
}[keyof Tree] &
  string;

type InferEventPayload<F> = F extends (...args: infer Args) => any
  ? Args extends [any, infer P, ...any[]]
    ? P
    : never
  : never;

type InferCrossStateEventPayload<F> = F extends (...args: infer Args) => any
  ? Args extends [infer P, ...any[]]
    ? P
    : never
  : never;

type EventPayloadFor<Tree, EventName extends string> = {
  [S in keyof Tree]: EventName extends keyof NonNullable<Tree[S]>
    ? S extends '*'
      ? InferCrossStateEventPayload<NonNullable<Tree[S]>[EventName]>
      : InferEventPayload<NonNullable<Tree[S]>[EventName]>
    : never;
}[keyof Tree];

type EventObject<
  Tree,
  Name extends string,
  Payload = EventPayloadFor<Tree, Name>,
> = [Payload] extends [never]
  ? { type: Name }
  : { type: Name; payload: Payload };

type EventCreatorsMap<Tree> = Simplify<{
  [EN in EventNames<Tree>]: [EventPayloadFor<Tree, EN>] extends [never]
    ? () => EventObject<Tree, EN>
    : (payload: EventPayloadFor<Tree, EN>) => EventObject<Tree, EN>;
}>;

type EventType<Tree> = {
  [E in EventNames<Tree>]: EventObject<Tree, E>;
}[EventNames<Tree>];

type EventPayloadAnynessUnion<Tree, EventName extends string> = {
  [S in keyof Tree]: EventName extends keyof NonNullable<Tree[S]>
    ? S extends '*'
      ? IsAny<InferCrossStateEventPayload<NonNullable<Tree[S]>[EventName]>>
      : IsAny<InferEventPayload<NonNullable<Tree[S]>[EventName]>>
    : never;
}[keyof Tree];

type HasPayloadMixedWithAny<Tree, E extends string> =
  true extends EventPayloadAnynessUnion<Tree, E>
    ? false extends EventPayloadAnynessUnion<Tree, E>
      ? true
      : false
    : false;

type MismatchErrorMessage = 'Mismatching payload types across handlers';

type ContributingStates<Tree, E extends string> = {
  [S in keyof Tree]: E extends keyof NonNullable<Tree[S]> ? S : never;
}[keyof Tree];

type WrappedPayloads<Tree, E extends string> = {
  [S in keyof Tree]: E extends keyof NonNullable<Tree[S]>
    ? S extends '*'
      ? [InferCrossStateEventPayload<NonNullable<Tree[S]>[E]>]
      : [InferEventPayload<NonNullable<Tree[S]>[E]>]
    : never;
}[keyof Tree];

type AllPayloadsEqual<Tree, E extends string> = IsEqual<
  WrappedPayloads<Tree, E>,
  [EventPayloadFor<Tree, E>]
>;

type ValidateEventPayloadsConsistency<Tree> = {
  [S in keyof Tree]: {
    [E in keyof NonNullable<Tree[S]>]: E extends string
      ? [EventPayloadFor<Tree, E>] extends [never]
        ? NonNullable<Tree[S]>[E]
        : IsUnion<ContributingStates<Tree, E>> extends false
          ? NonNullable<Tree[S]>[E]
          : HasPayloadMixedWithAny<Tree, E> extends true
            ? ApiError<MismatchErrorMessage>
            : IsEqual<
                  EventPayloadFor<Tree, E>,
                  UnionToIntersection<EventPayloadFor<Tree, E>>
                > extends true
              ? NonNullable<Tree[S]>[E]
              : AllPayloadsEqual<Tree, E> extends true
                ? NonNullable<Tree[S]>[E]
                : ApiError<MismatchErrorMessage>
      : NonNullable<Tree[S]>[E];
  };
};

type Machine<
  StateCreators extends readonly AnyStateCreator[],
  Tree,
> = Simplify<{
  event: EventCreatorsMap<Tree>;
  state: StateCreatorsMap<StateCreators>;
  transition: (
    state: StateType<StateCreators>,
    event: EventType<Tree>,
  ) => StateType<StateCreators>;
}>;

type CreateMachineOptions<
  StateCreators extends readonly AnyStateCreator[],
  Tree,
> = {
  onInvalidTransition?: (context: {
    state: StateType<StateCreators>;
    event: EventType<Tree>;
  }) => void;
};

const defaultInvalidTransitionLogger = (context: {
  state: { name: string };
  event: { type: string };
}) => {
  console.error(
    `Invalid transition: event '${context.event.type}' not allowed in state '${context.state.name}'`,
  );
};

type StateNamesOfDefinitions<
  Definitions extends readonly AnyStateDefinition[],
> = {
  [K in keyof Definitions]: Definitions[K] extends {
    stateName: infer Name extends string;
  }
    ? Name
    : never;
};

type FirstDuplicate<Items extends readonly unknown[]> = Items extends readonly [
  infer Head,
  ...infer Rest,
]
  ? Rest extends readonly unknown[]
    ? Head extends Rest[number]
      ? Head
      : FirstDuplicate<Rest>
    : never
  : never;

type ValidateCombine<
  DefinitionGroups extends readonly (readonly AnyStateDefinition[])[],
> =
  FirstDuplicate<
    StateNamesOfDefinitions<Flatten<DefinitionGroups>>
  > extends infer Duplicate
    ? [Duplicate] extends [never]
      ? DefinitionGroups
      : {
          [_I in keyof DefinitionGroups]: ApiError<`Duplicate state '${Duplicate & string}'`>;
        }
    : DefinitionGroups;

export type StateOf<
  MapOfStateCreators extends StateCreatorsMap<readonly AnyStateCreator[]>,
  StateName extends keyof MapOfStateCreators = keyof MapOfStateCreators,
> = Simplify<
  {
    [SN in StateName]: MapOfStateCreators[SN] extends AnyStateCreator
      ? ReturnType<MapOfStateCreators[SN]>
      : never;
  }[StateName]
>;

export type StateCreatorOf<
  MapOfStateCreators extends StateCreatorsMap<readonly AnyStateCreator[]>,
  StateName extends keyof MapOfStateCreators = keyof MapOfStateCreators,
> = {
  [SN in StateName]: MapOfStateCreators[SN] extends AnyStateCreator
    ? MapOfStateCreators[SN]
    : never;
}[StateName];

export type EventOf<
  MapOfEventCreators extends Record<string, (...args: any) => { type: string }>,
  EventName extends keyof MapOfEventCreators = keyof MapOfEventCreators,
> = {
  [K in EventName]: MapOfEventCreators[K] extends (...args: any) => any
    ? ReturnType<MapOfEventCreators[K]>
    : never;
}[EventName];

export type EventPayloadOf<EventCreator extends (...args: never[]) => unknown> =
  Parameters<EventCreator> extends [infer Payload] ? Payload : never;

export const combineStates = <
  const DefinitionGroups extends readonly (readonly AnyStateDefinition[])[],
>(
  ...stateDefinitionItems: ValidateCombine<DefinitionGroups>
) => {
  type StateCreators = StateCreatorsFromDefinitions<Flatten<DefinitionGroups>>;
  const allDefinitions = stateDefinitionItems.flat() as AnyStateDefinition[];

  const validatedStateNames = new Set<string>();
  for (const definition of allDefinitions) {
    if (definition.stateName === '*') {
      throw new Error("'*' is reserved for cross-state events");
    }
    if (validatedStateNames.has(definition.stateName)) {
      throw new Error(`Duplicate state '${definition.stateName}'`);
    }
    validatedStateNames.add(definition.stateName);
  }

  const stateCreators = allDefinitions.map(makeStateCreator);
  const stateCreatorsMap = Object.fromEntries(
    stateCreators.map(creator => [creator.stateName, creator]),
  ) as StateCreatorsMap<StateCreators>;

  type TreeShape = StateMachineTree<StateCreators>;

  const createMachine = <
    const TreeOrFactory extends
      | TreeShape
      | ((state: StateCreatorsMap<StateCreators>) => TreeShape),
    Tree extends TreeOrFactory extends (...args: any) => infer T
      ? T
      : TreeOrFactory,
  >(
    treeOrFactory: TreeOrFactory extends (...args: infer A) => infer T
      ? (...args: A) => T & ValidateEventPayloadsConsistency<T>
      : TreeOrFactory & ValidateEventPayloadsConsistency<TreeOrFactory>,
    {
      onInvalidTransition = defaultInvalidTransitionLogger,
    }: CreateMachineOptions<StateCreators, Tree> = {},
  ): Machine<StateCreators, Tree> => {
    const tree = (
      typeof treeOrFactory === 'function'
        ? treeOrFactory(stateCreatorsMap)
        : treeOrFactory
    ) as TreeShape;
    const eventNames = Array.from(
      new Set(Object.values(tree).flatMap(Object.keys)),
    );

    const makeEventCreator = (type: string) => (payload?: unknown) =>
      payload === undefined ? { type } : { type, payload };
    const eventCreatorsMap = Object.fromEntries(
      eventNames.map(type => [type, makeEventCreator(type)]),
    ) as EventCreatorsMap<Tree>;

    const transition = (
      currentState: StateType<StateCreators>,
      event: EventType<Tree>,
    ): StateType<StateCreators> => {
      const eventPayload = 'payload' in event ? event.payload : undefined;
      const stateNode = tree[currentState.name as keyof TreeShape];
      const eventHandler = stateNode?.[event.type as keyof typeof stateNode] as
        | EventHandler<StateCreators, AnyStateCreator>
        | undefined;

      if (eventHandler) {
        const data = 'data' in currentState ? currentState.data : undefined;
        return eventHandler(data, eventPayload) as StateType<StateCreators>;
      }

      const crossStateHandlers = tree['*'];
      const crossStateEventHandler = crossStateHandlers?.[event.type];
      if (crossStateEventHandler) {
        return crossStateEventHandler(eventPayload) as StateType<StateCreators>;
      }

      onInvalidTransition({ state: currentState, event });
      return currentState;
    };

    return { event: eventCreatorsMap, state: stateCreatorsMap, transition };
  };

  return { state: stateCreatorsMap, createMachine };
};

export type AnyState = ReturnType<StateCreator<string, any>>;

export type AnyMachine = {
  event: Record<string, (...args: any) => { type: string }>;
  state: Record<string, AnyStateCreator>;
  transition: (state: any, event: any) => AnyState;
};
