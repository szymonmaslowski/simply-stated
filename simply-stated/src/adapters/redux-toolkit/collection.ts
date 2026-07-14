import { createEntityAdapter } from '@reduxjs/toolkit';
import type {
  Comparer,
  EntityAdapter,
  EntityId as RTKEntityId,
  EntitySelectors,
  EntityState,
  PayloadAction,
  SliceSelectors,
} from '@reduxjs/toolkit';
import type { Simplify } from 'type-fest';
import type { AnyMachine, ApiError, EventPayloadOf } from '../../simply-stated';
import { getAtPath, setAtPath, splitPath } from '../../path';
import { rebindUserSelectors } from './shared';
import type { GenericReducer, NestAt, StateOfMachine } from './shared';

const entityAdapterCrudFnNames = [
  'addOne',
  'addMany',
  'setOne',
  'setMany',
  'setAll',
  'removeOne',
  'removeMany',
  'removeAll',
  'updateOne',
  'updateMany',
  'upsertOne',
  'upsertMany',
] as const;

type DataOfMachine<Machine extends AnyMachine> = [
  StateOfMachine<Machine>,
] extends [{ data: infer D }]
  ? D
  : never;

type Entity<
  Machine extends AnyMachine,
  Id extends RTKEntityId,
  Mode,
> = Mode extends 'data'
  ? StateOfMachine<Machine>
  : Simplify<{ entityId: Id } & StateOfMachine<Machine>>;

type CollectionPayload<Id extends RTKEntityId, P> = [P] extends [never]
  ? { entityId: Id }
  : { entityId: Id; payload: P };

type ModeFor<SelectedEntityId> = [SelectedEntityId] extends [never]
  ? 'explicit'
  : 'data';

type EntityIdFor<SelectedEntityId> = [SelectedEntityId] extends [never]
  ? string
  : SelectedEntityId;

type EntityFor<
  Machine extends AnyMachine,
  SelectedEntityId extends RTKEntityId,
> = Entity<Machine, EntityIdFor<SelectedEntityId>, ModeFor<SelectedEntityId>>;

type EntitiesStateFor<
  Machine extends AnyMachine,
  SelectedEntityId extends RTKEntityId,
> = EntityState<
  EntityFor<Machine, SelectedEntityId>,
  EntityIdFor<SelectedEntityId>
>;

type CollectionSelectors<
  Machine extends AnyMachine,
  SelectedEntityId extends RTKEntityId,
> =
  | SliceSelectors<EntitiesStateFor<Machine, SelectedEntityId>>
  | ((
      entitySelectors: EntitySelectors<
        EntityFor<Machine, SelectedEntityId>,
        EntitiesStateFor<Machine, SelectedEntityId>,
        EntityIdFor<SelectedEntityId>
      >,
    ) => SliceSelectors<EntitiesStateFor<Machine, SelectedEntityId>>);

type EventReducers<
  Machine extends AnyMachine,
  Id extends RTKEntityId,
  SliceState,
> = {
  [K in keyof Machine['event']]: GenericReducer<
    SliceState,
    CollectionPayload<Id, EventPayloadOf<Machine['event'][K]>>
  >;
};

type AddEntityPayload<
  Machine extends AnyMachine,
  Id extends RTKEntityId,
  Mode,
> = Mode extends 'data'
  ? StateOfMachine<Machine>
  : StateOfMachine<Machine> & { entityId: Id };

type EntityLifecycleReducers<
  Machine extends AnyMachine,
  Id extends RTKEntityId,
  ReducerState,
  Mode,
> = {
  addEntity: GenericReducer<ReducerState, AddEntityPayload<Machine, Id, Mode>>;
  removeEntity: GenericReducer<ReducerState, { entityId: Id }>;
};

type EntityAdapterCRUDFnName = (typeof entityAdapterCrudFnNames)[number];

type EntityAdapterCRUDFunctions<
  Machine extends AnyMachine,
  SelectedEntityId extends RTKEntityId,
> = Pick<
  EntityAdapter<
    EntityFor<Machine, SelectedEntityId>,
    EntityIdFor<SelectedEntityId>
  >,
  EntityAdapterCRUDFnName
>;

type ForbidEventNameReducers<Machine extends AnyMachine> = {
  [EventName in keyof Machine['event']]?: ApiError<`Reducer '${EventName & string}' clashes with machine event '${EventName & string}'`>;
};

type CustomCaseReducers<EntitiesState> = Record<
  string,
  (state: EntitiesState, action: PayloadAction<never>) => EntitiesState | void
>;

type CollectionReducersFactory<
  Machine extends AnyMachine,
  SelectedEntityId extends RTKEntityId,
  CustomReducers,
> = (
  lifecycleReducers: EntityLifecycleReducers<
    Machine,
    EntityIdFor<SelectedEntityId>,
    EntitiesStateFor<Machine, SelectedEntityId>,
    ModeFor<SelectedEntityId>
  >,
  entityAdapterCRUD: EntityAdapterCRUDFunctions<Machine, SelectedEntityId>,
) => CustomReducers &
  CustomCaseReducers<EntitiesStateFor<Machine, SelectedEntityId>> &
  ForbidEventNameReducers<Machine>;

type RebindReducers<SliceState, Reducers> = {
  [K in keyof Reducers]: Parameters<
    Extract<Reducers[K], (...args: never) => unknown>
  > extends [state: unknown, action: infer Action]
    ? <S extends SliceState>(state: S, action: Action) => S
    : <S extends SliceState>(state: S) => S;
};

type FinalCollectionReducers<
  Machine extends AnyMachine,
  Id extends RTKEntityId,
  SliceState,
  Mode,
  CustomReducers,
> = EventReducers<Machine, Id, SliceState> &
  (string extends keyof CustomReducers
    ? EntityLifecycleReducers<Machine, Id, SliceState, Mode>
    : RebindReducers<SliceState, CustomReducers>);

export const toCollectionSliceOptions = <
  Machine extends AnyMachine,
  Selectors,
  SelectedEntityId extends RTKEntityId = never,
  const NestingPath extends string | undefined = undefined,
  CustomReducers extends CustomCaseReducers<
    EntitiesStateFor<Machine, SelectedEntityId>
  > = CustomCaseReducers<EntitiesStateFor<Machine, SelectedEntityId>>,
>(
  machine: Machine,
  options?: {
    nestingPath?: NestingPath;
    reducers?: CollectionReducersFactory<
      Machine,
      SelectedEntityId,
      CustomReducers
    >;
    selectIdFromData?: (data: DataOfMachine<Machine>) => SelectedEntityId;
    selectors?: Selectors & CollectionSelectors<Machine, SelectedEntityId>;
    sortComparer?: Comparer<EntityFor<Machine, SelectedEntityId>>;
  },
) => {
  type EntityId = EntityIdFor<SelectedEntityId>;
  type Mode = ModeFor<SelectedEntityId>;
  type CollectionEntity = EntityFor<Machine, SelectedEntityId>;
  type EntitiesState = EntitiesStateFor<Machine, SelectedEntityId>;
  type SliceState = NestAt<NestingPath, EntitiesState>;
  type UserSelectors = Selectors extends (e: never) => infer S ? S : Selectors;
  type RTKEntityAdapterFactory = typeof createEntityAdapter<
    CollectionEntity,
    EntityId
  >;

  const {
    nestingPath = '',
    reducers: makeCustomReducers,
    selectIdFromData,
    selectors: userSelectors = {},
    sortComparer,
  } = options ?? {};

  const pathKeys = splitPath(nestingPath);

  const entityAdapterOptions: Parameters<RTKEntityAdapterFactory>[0] = {
    selectId: entity => {
      // If no selectIdFromData then it's explicit mode - entityId in entity
      if (!selectIdFromData) return (entity as { entityId: EntityId }).entityId;

      // type conversion is safe here - if machine had state missing data then
      // it would not be possible to specify selectIdFromData;
      const data = (entity as unknown as { data: unknown }).data;
      return selectIdFromData(data as DataOfMachine<Machine>) as EntityId;
    },
  };
  if (sortComparer) {
    entityAdapterOptions.sortComparer = (a, b) => sortComparer(a, b);
  }
  const entityAdapter = createEntityAdapter<CollectionEntity, EntityId>(
    entityAdapterOptions,
  );

  const extractEntitiesState = (state: SliceState) =>
    getAtPath<EntitiesState>(state, pathKeys);

  const eventReducers = Object.fromEntries(
    Object.keys(machine.event).map(type => [
      type,
      (state, action) => {
        const entitiesCollection = extractEntitiesState(state);
        const entity = entitiesCollection.entities[action.payload.entityId];
        if (!entity) return state;

        const payload =
          'payload' in action.payload ? action.payload.payload : undefined;
        const nextState = machine.transition(
          entity,
          machine.event[type]!(payload),
        );

        let nextEntity = nextState as CollectionEntity;
        if (!selectIdFromData) {
          nextEntity = {
            entityId: action.payload.entityId,
            ...nextState,
          } as CollectionEntity;
        }
        entityAdapter.setOne(entitiesCollection, nextEntity);

        return state;
      },
    ]),
  ) as EventReducers<Machine, EntityId, SliceState>;

  const lifecycleReducers = {
    addEntity: (entitiesState, { payload }) => {
      let newEntity = payload;
      if (!selectIdFromData) {
        newEntity = {
          // If no selectIdFromData then it's explicit mode - entityId in entity
          entityId: (payload as { entityId: EntityId }).entityId,
          ...payload,
        };
      }

      entityAdapter.addOne(entitiesState, newEntity);
      return entitiesState;
    },
    removeEntity: (entitiesState, action) => {
      entityAdapter.removeOne(entitiesState, action.payload.entityId);
      return entitiesState;
    },
  } as EntityLifecycleReducers<
    Machine,
    EntityIdFor<SelectedEntityId>,
    EntitiesStateFor<Machine, SelectedEntityId>,
    ModeFor<SelectedEntityId>
  >;

  const entityAdapterCRUD = Object.fromEntries(
    entityAdapterCrudFnNames.map(name => [name, entityAdapter[name]] as const),
  ) as EntityAdapterCRUDFunctions<Machine, SelectedEntityId>;

  const customReducers = makeCustomReducers?.(
    lifecycleReducers,
    entityAdapterCRUD,
  );

  const rebindReducers = (
    reducers: Record<
      string,
      (
        state: EntitiesStateFor<Machine, SelectedEntityId>,
        action: PayloadAction<never>,
      ) => unknown
    >,
  ) =>
    Object.fromEntries(
      Object.entries(reducers).map(([type, reducer]) => [
        type,
        (state: SliceState, action: PayloadAction<never>) => {
          const entitiesState = extractEntitiesState(state);
          const result = reducer(entitiesState, action);

          if (result === undefined || result === entitiesState) return state;
          return setAtPath<SliceState>(state, pathKeys, result);
        },
      ]),
    );

  const reducers = {
    ...eventReducers,
    ...rebindReducers(customReducers ?? lifecycleReducers),
  } as FinalCollectionReducers<
    Machine,
    EntityId,
    SliceState,
    Mode,
    CustomReducers
  >;

  const entitySelectors = entityAdapter.getSelectors();

  const userSelectorMap: UserSelectors =
    typeof userSelectors === 'function'
      ? userSelectors(entitySelectors)
      : userSelectors;

  const selectors = rebindUserSelectors(
    userSelectorMap as UserSelectors & SliceSelectors<EntitiesState>,
    extractEntitiesState,
  );

  const initialState = setAtPath<SliceState>(
    {},
    pathKeys,
    entityAdapter.getInitialState(),
  );

  return { entityAdapter, initialState, reducers, selectors };
};
