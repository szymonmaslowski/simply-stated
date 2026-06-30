import {
  type Comparer,
  createEntityAdapter,
  type SliceSelectors,
} from '@reduxjs/toolkit';
import type { EntityId as RTKEntityId, EntityState } from '@reduxjs/toolkit';
import type { Simplify } from 'type-fest';
import {
  type AnyNativeState,
  toNativeState,
  toPlainState,
} from '../../simply-stated';
import type { AnyMachine } from '../../simply-stated';
import { getAtPath, setAtPath, rebindUserSelectors } from './shared';
import type {
  EventPayload,
  EventReducer,
  NativeStateOfMachine,
  NestAt,
  PlainStateOfMachine,
  RebindSelectors,
  ReservedSelectors,
} from './shared';

type DataOfMachine<Machine extends AnyMachine> = [
  NativeStateOfMachine<Machine>,
] extends [{ data: infer D }]
  ? D
  : never;

type PlainEntity<
  Machine extends AnyMachine,
  Id extends RTKEntityId,
  Mode,
> = Mode extends 'data'
  ? PlainStateOfMachine<Machine>
  : Simplify<{ entityId: Id } & PlainStateOfMachine<Machine>>;

type NativeEntity<
  Machine extends AnyMachine,
  Id extends RTKEntityId,
  Mode,
> = Mode extends 'data'
  ? NativeStateOfMachine<Machine>
  : Simplify<{ entityId: Id } & NativeStateOfMachine<Machine>>;

type CollectionPayload<Id extends RTKEntityId, P> = [P] extends [never]
  ? { entityId: Id }
  : { entityId: Id; payload: P };

type EventReducers<
  Machine extends AnyMachine,
  Id extends RTKEntityId,
  SliceState,
> = {
  [K in keyof Machine['event']]: EventReducer<
    SliceState,
    CollectionPayload<Id, EventPayload<Machine['event'][K]>>
  >;
};

type AddEntityInput<
  Machine extends AnyMachine,
  Id extends RTKEntityId,
  Mode,
> = Mode extends 'data'
  ? { state: NativeStateOfMachine<Machine> }
  : { entityId: Id; state: NativeStateOfMachine<Machine> };

type LifecycleReducers<
  Machine extends AnyMachine,
  Id extends RTKEntityId,
  SliceState,
  Mode,
> = {
  addEntity: {
    reducer: EventReducer<SliceState, PlainEntity<Machine, Id, Mode>>;
    prepare: (input: AddEntityInput<Machine, Id, Mode>) => {
      payload: PlainEntity<Machine, Id, Mode>;
    };
  };
  removeEntity: EventReducer<SliceState, { entityId: Id }>;
};

type JointReducers<
  Machine extends AnyMachine,
  Id extends RTKEntityId,
  SliceState,
  Mode,
> = EventReducers<Machine, Id, SliceState> &
  LifecycleReducers<Machine, Id, SliceState, Mode>;

type BuiltinSelectorName =
  | 'selectIds'
  | 'selectTotalCount'
  | 'selectAllNative'
  | 'selectNativeEntitiesMap'
  | 'selectNativeById';

type EntityStateSelectors<
  Machine extends AnyMachine,
  Id extends RTKEntityId,
  SliceState,
  Mode,
> = {
  selectIds: (state: SliceState) => Id[];
  selectTotalCount: (state: SliceState) => number;
  selectAllNative: (state: SliceState) => NativeEntity<Machine, Id, Mode>[];
  selectNativeEntitiesMap: (
    state: SliceState,
  ) => Record<Id, NativeEntity<Machine, Id, Mode>>;
  selectNativeById: (
    state: SliceState,
    id: Id,
  ) => NativeEntity<Machine, Id, Mode> | undefined;
};

type CollectionSliceOptions<Machine extends AnyMachine> = {
  nestingPath?: string;
  selectIdFromData?: (data: DataOfMachine<Machine>) => RTKEntityId;
  selectors?: SliceSelectors<
    Record<RTKEntityId, NativeEntity<Machine, RTKEntityId, 'data' | 'explicit'>>
  > &
    ReservedSelectors<BuiltinSelectorName>;
  sortComparer?: Comparer<
    NativeEntity<Machine, RTKEntityId, 'data' | 'explicit'>
  >;
};

type ModeFromOptions<O> = O extends {
  selectIdFromData: (...args: never[]) => unknown;
}
  ? 'data'
  : 'explicit';

type EntityIdFromOptions<O> = O extends {
  selectIdFromData: (...args: never[]) => infer R extends RTKEntityId;
}
  ? R
  : string;

type NestingPathFromOptions<O> = O extends {
  nestingPath: infer P extends string;
}
  ? P
  : undefined;

type SelectorsFromOptions<O> = O extends { selectors: infer S }
  ? S
  : Record<never, never>;

export const toCollectionSliceOptions = <
  Machine extends AnyMachine,
  const O extends CollectionSliceOptions<Machine>,
>(
  machine: Machine,
  options?: O,
) => {
  type EntityId = EntityIdFromOptions<O>;
  type Mode = ModeFromOptions<O>;
  type Entity = PlainEntity<Machine, EntityId, Mode>;
  type EntitiesState = EntityState<Entity, EntityId>;
  type SliceState = NestAt<NestingPathFromOptions<O>, EntitiesState>;

  const {
    nestingPath = '',
    selectIdFromData,
    selectors: userSelectors,
    sortComparer,
  } = options ?? {};

  const toNativeEntity = (entity: Entity) =>
    toNativeState(entity) as NativeEntity<Machine, EntityId, Mode>;

  const resolveEntityId = (entity: Entity): EntityId => {
    if (!selectIdFromData) return entity.entityId;

    const data = (
      'data' in entity ? entity.data : undefined
    ) as DataOfMachine<Machine>;
    return selectIdFromData(data) as EntityId;
  };

  const entityAdapterOptions: Parameters<
    typeof createEntityAdapter<Entity, EntityId>
  >[0] = {
    selectId: resolveEntityId,
  };
  if (sortComparer) {
    entityAdapterOptions.sortComparer = (a, b) =>
      sortComparer(toNativeEntity(a), toNativeEntity(b));
  }
  const entityAdapter = createEntityAdapter<Entity, EntityId>(
    entityAdapterOptions,
  );

  const extractEntitiesState = (state: SliceState) =>
    getAtPath<EntitiesState>(state, nestingPath);

  const stateToEntity = (state: AnyNativeState, entityId: EntityId): Entity => {
    const plainState = toPlainState(state);
    return selectIdFromData
      ? (plainState as Entity)
      : ({
          entityId,
          ...plainState,
        } as Entity);
  };

  const eventReducers = Object.fromEntries(
    Object.keys(machine.event).map(type => [
      type,
      (state, action) => {
        const entitiesCollection = extractEntitiesState(state);
        const entity = entitiesCollection.entities[action.payload.entityId];

        if (entity) {
          const payload =
            'payload' in action.payload ? action.payload.payload : undefined;
          const nextState = machine.transition(
            entity,
            machine.event[type]!(payload),
          );
          entityAdapter.setOne(
            entitiesCollection,
            stateToEntity(nextState, entity.entityId),
          );
        }

        return state;
      },
    ]),
  ) as EventReducers<Machine, EntityId, SliceState>;

  const lifecycleReducers = {
    addEntity: {
      reducer: (state, action) => {
        entityAdapter.addOne(extractEntitiesState(state), action.payload);
        return state;
      },
      prepare: input => ({
        payload: stateToEntity(input.state, input.entityId),
      }),
    },
    removeEntity: (state, action) => {
      entityAdapter.removeOne(
        extractEntitiesState(state),
        action.payload.entityId,
      );
      return state;
    },
  } as LifecycleReducers<Machine, EntityId, SliceState, Mode>;

  const reducers = {
    ...eventReducers,
    ...lifecycleReducers,
  } as JointReducers<Machine, EntityId, SliceState, Mode>;

  const entitySelectors = entityAdapter.getSelectors();

  const selectNativeEntitiesMap = (state: SliceState) =>
    Object.fromEntries(
      entitySelectors
        .selectAll(extractEntitiesState(state))
        .map(entity => [resolveEntityId(entity), toNativeEntity(entity)]),
    ) as Record<EntityId, NativeEntity<Machine, EntityId, Mode>>;

  const reboundUserSelectors = rebindUserSelectors(
    userSelectors ?? {},
    selectNativeEntitiesMap,
  );

  const builtinSelectors = {
    selectIds: state => entitySelectors.selectIds(extractEntitiesState(state)),
    selectTotalCount: state =>
      entitySelectors.selectTotal(extractEntitiesState(state)),
    selectAllNative: state =>
      entitySelectors
        .selectAll(extractEntitiesState(state))
        .map(toNativeEntity),
    selectNativeEntitiesMap,
    selectNativeById: (state, id: EntityId) => {
      const entity = entitySelectors.selectById(
        extractEntitiesState(state),
        id,
      );
      return entity ? toNativeEntity(entity as Entity) : undefined;
    },
  } satisfies EntityStateSelectors<Machine, EntityId, SliceState, Mode>;

  const selectors = {
    ...builtinSelectors,
    ...reboundUserSelectors,
  } as Simplify<
    EntityStateSelectors<Machine, EntityId, SliceState, Mode> &
      RebindSelectors<SliceState, SelectorsFromOptions<O>>
  >;

  const initialState = setAtPath<SliceState>(
    {},
    nestingPath,
    entityAdapter.getInitialState(),
  );

  return { entityAdapter, initialState, reducers, selectors };
};
