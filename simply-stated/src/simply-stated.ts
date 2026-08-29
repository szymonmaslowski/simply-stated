/* eslint-disable @typescript-eslint/no-explicit-any */

import type {
  Flatten,
  GetTagMetadata,
  IsAny,
  IsEqual,
  IsUnion,
  Simplify,
  Tagged,
  UnionToIntersection,
} from './type-utils';

declare const usageGuardError: unique symbol;
export type UsageGuardError<M extends string> = {
  readonly [usageGuardError]: M;
};

type StateDefinition<
  StateName extends string,
  Data extends NonNullable<unknown> | void = void,
  HasData extends boolean = false,
> = Tagged<
  { stateName: StateName; withData: HasData },
  'StateDefinition',
  Data
>;

type AnyStateDefinition = StateDefinition<string, any, boolean>;

type StateDefinitionsFor<
  StateNames extends readonly string[],
  Data extends NonNullable<unknown> | void = void,
  HasData extends boolean = false,
> = {
  [SN in keyof StateNames]: StateNames[SN] extends string
    ? StateDefinition<StateNames[SN], Data, HasData>
    : never;
};

type DefineStateTuple<StateNames extends readonly string[]> =
  StateDefinitionsFor<StateNames> & {
    withData<Data extends NonNullable<unknown>>(): StateDefinitionsFor<
      StateNames,
      Data,
      true
    >;
  };

type StateObject<
  StateName extends string,
  Data extends NonNullable<unknown> | void = void,
  HasData extends boolean = false,
> = Readonly<
  HasData extends true ? { name: StateName; data: Data } : { name: StateName }
>;

type StateCreator<
  StateName extends string,
  Data extends NonNullable<unknown> | void,
  HasData extends boolean,
> = ((
  ...args: HasData extends true ? [data: Data] : []
) => StateObject<StateName, Data, HasData>) & {
  stateName: StateName;
};

export type AnyState = StateObject<string, any, true> | StateObject<string>;

export type AnyStateCreator = {
  (...args: any[]): AnyState;
  stateName: string;
};

export type AnyMachine = Tagged<
  {
    event: Record<string, (...args: any) => { type: string }>;
    state: Record<string, AnyStateCreator>;
    transition: (state: any, event: any) => AnyState;
  },
  'MachineTree',
  unknown
>;

type StateCreatorsFromDefinitions<
  Definitions extends readonly AnyStateDefinition[],
> = {
  [K in keyof Definitions]: Definitions[K] extends AnyStateDefinition
    ? Definitions[K] extends StateDefinition<
        infer Name extends string,
        any,
        infer HasData extends boolean
      >
      ? StateCreator<
          Name,
          GetTagMetadata<Definitions[K], 'StateDefinition'>,
          HasData
        >
      : never
    : never;
};

type ValidateNoStar<StateNames extends readonly string[]> = {
  [SN in keyof StateNames]: StateNames[SN] extends '*'
    ? UsageGuardError<`'*' is reserved for cross-state events`>
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
}: StateDefinition<string, Data, boolean>) => {
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
    HasData extends boolean = false,
  >(
    withData: boolean = false,
  ) =>
    stateNames.map(stateName => ({
      stateName,
      withData,
    })) as StateDefinitionsFor<StateNames, Data, HasData>;

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

type DataOfStateCreator<SC extends AnyStateCreator> =
  Parameters<SC> extends [infer Data] ? Data : undefined;

type EventHandler<
  StateCreators extends readonly AnyStateCreator[],
  SC extends AnyStateCreator | void = void,
> = SC extends void
  ? (...payload: any) => StateType<StateCreators>
  : SC extends AnyStateCreator
    ? (
        data: DataOfStateCreator<SC>,
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

type ValidateEventPayloadsConsistency<
  Tree,
  S extends keyof Tree,
  E extends keyof NonNullable<Tree[S]>,
> = E extends string
  ? [EventPayloadFor<Tree, E>] extends [never]
    ? NonNullable<Tree[S]>[E]
    : IsUnion<ContributingStates<Tree, E>> extends false
      ? NonNullable<Tree[S]>[E]
      : HasPayloadMixedWithAny<Tree, E> extends true
        ? UsageGuardError<MismatchErrorMessage>
        : IsEqual<
              EventPayloadFor<Tree, E>,
              UnionToIntersection<EventPayloadFor<Tree, E>>
            > extends true
          ? NonNullable<Tree[S]>[E]
          : AllPayloadsEqual<Tree, E> extends true
            ? NonNullable<Tree[S]>[E]
            : UsageGuardError<MismatchErrorMessage>
  : NonNullable<Tree[S]>[E];

type ValidateNestedTransitions<
  Tree,
  S extends keyof Tree,
  E extends keyof NonNullable<Tree[S]>,
> =
  NonNullable<Tree[S]>[E] extends UsageGuardError<any>
    ? never
    : NonNullable<Tree[S]>[E];

type ValidateTree<Tree> = {
  [S in keyof Tree]: {
    [E in keyof NonNullable<Tree[S]>]: ValidateEventPayloadsConsistency<
      Tree,
      S,
      E
    > &
      ValidateNestedTransitions<Tree, S, E>;
  };
};

type EventHandlerTargetState<Handler> = Handler extends (
  ...args: any
) => infer Result
  ? Result
  : never;

type ResolveCrossStateTransitionTargetState<
  Tree,
  EventName extends string,
> = '*' extends keyof Tree
  ? EventName extends keyof NonNullable<Tree['*']>
    ? EventHandlerTargetState<NonNullable<Tree['*']>[EventName]>
    : never
  : never;

type ResolveTransitionTargetState<
  Tree,
  StateName extends string,
  EventName extends string,
> = StateName extends keyof Tree
  ? EventName extends keyof NonNullable<Tree[StateName]>
    ? EventHandlerTargetState<NonNullable<Tree[StateName]>[EventName]>
    : ResolveCrossStateTransitionTargetState<Tree, EventName>
  : ResolveCrossStateTransitionTargetState<Tree, EventName>;

export type NarrowedTransition<Tree, InputState, InputEvent> = Simplify<
  InputState extends { name: infer StateName extends string }
    ? InputEvent extends { type: infer EventName extends string }
      ? ResolveTransitionTargetState<
          Tree,
          StateName,
          EventName
        > extends infer ResolvedState
        ? [ResolvedState] extends [never]
          ? InputState
          : ResolvedState
        : never
      : never
    : never
>;

// The transition tree is embedded as tag metadata on the machine, so it never
// appears as a real property (invisible when destructuring `{ state, event,
// transition }`) yet stays recoverable via `TreeOf` for the nesting helpers.
export type TreeOf<Machine extends AnyMachine> = GetTagMetadata<
  Machine,
  'MachineTree'
>;

type Machine<StateCreators extends readonly AnyStateCreator[], Tree> = Tagged<
  Simplify<{
    event: EventCreatorsMap<Tree>;
    state: StateCreatorsMap<StateCreators>;
    transition: {
      <
        const InputState extends StateType<StateCreators>,
        const InputEvent extends EventType<Tree>,
      >(
        state: InputState,
        event: InputEvent,
      ): NarrowedTransition<Tree, InputState, InputEvent>;
      (
        state: StateType<StateCreators>,
        event: EventType<Tree>,
      ): StateType<StateCreators>;
    };
  }>,
  'MachineTree',
  Tree
>;

type CreateMachineOptions<
  StateCreators extends readonly AnyStateCreator[],
  Tree,
> = {
  onTransition?: (context: {
    state: StateType<StateCreators>;
    event: EventType<Tree>;
    nextState: StateType<StateCreators>;
  }) => void;
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
          [_I in keyof DefinitionGroups]: UsageGuardError<`Duplicate state '${Duplicate & string}'`>;
        }
    : DefinitionGroups;

// The `extends infer Result ? Result : never` tails below are load-bearing for
// tooltips: they make editors print the plain object union.
export type StateOf<
  MapOfStateCreators extends StateCreatorsMap<readonly AnyStateCreator[]>,
  StateName extends keyof MapOfStateCreators = keyof MapOfStateCreators,
> = {
  [SN in StateName]: MapOfStateCreators[SN] extends AnyStateCreator
    ? Simplify<ReturnType<MapOfStateCreators[SN]>>
    : never;
}[StateName] extends infer Result
  ? Result
  : never;

export type StateCreatorOf<
  MapOfStateCreators extends StateCreatorsMap<readonly AnyStateCreator[]>,
  StateName extends keyof MapOfStateCreators = keyof MapOfStateCreators,
> = {
  [SN in StateName]: MapOfStateCreators[SN] extends AnyStateCreator
    ? MapOfStateCreators[SN]
    : never;
}[StateName] extends infer Result
  ? Result
  : never;

export type EventOf<
  MapOfEventCreators extends Record<string, (...args: any) => { type: string }>,
  EventName extends keyof MapOfEventCreators = keyof MapOfEventCreators,
> = {
  [K in EventName]: MapOfEventCreators[K] extends (...args: any) => any
    ? Simplify<ReturnType<MapOfEventCreators[K]>>
    : never;
}[EventName] extends infer Result
  ? Result
  : never;

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
      ? (...args: A) => ValidateTree<T> & T
      : ValidateTree<TreeOrFactory> & TreeOrFactory,
    {
      onTransition,
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

      const data = 'data' in currentState ? currentState.data : undefined;
      const crossStateEventHandler = tree['*']?.[event.type];

      let nextState: StateType<StateCreators> | null = null;
      if (eventHandler) {
        nextState = eventHandler(data, eventPayload);
      } else if (crossStateEventHandler) {
        nextState = crossStateEventHandler(eventPayload);
      }

      if (nextState === null) {
        onInvalidTransition({ state: currentState, event });
        return currentState;
      }

      onTransition?.({ state: currentState, event, nextState });
      return nextState;
    };

    return {
      event: eventCreatorsMap,
      state: stateCreatorsMap,
      transition,
    } as Machine<StateCreators, Tree>;
  };

  return { state: stateCreatorsMap, createMachine };
};
