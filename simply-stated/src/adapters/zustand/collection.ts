import type { StoreApi } from 'zustand/vanilla';
import { getAtPath, setAtPath, splitPath } from '../../path';
import type { AnyMachine } from '../../simply-stated';
import type {
  EventActions,
  NestAt,
  StateOfMachine,
  UnknownStore,
} from './shared';

type DataOfMachine<Machine extends AnyMachine> = [
  StateOfMachine<Machine>,
] extends [{ data: infer Data }]
  ? Data
  : never;

type ModeFor<SelectedEntityId> = [SelectedEntityId] extends [never]
  ? 'explicit'
  : 'data';

type EntityIdFor<SelectedEntityId> = [SelectedEntityId] extends [never]
  ? string
  : SelectedEntityId;

type CollectionMap<
  Machine extends AnyMachine,
  EntityId extends PropertyKey,
> = Partial<Record<EntityId, StateOfMachine<Machine>>>;

type AddEntityAction<
  Machine extends AnyMachine,
  EntityId extends PropertyKey,
  Mode,
> = Mode extends 'data'
  ? (state: StateOfMachine<Machine>) => void
  : (entityId: EntityId, state: StateOfMachine<Machine>) => void;

type LifecycleActions<
  Machine extends AnyMachine,
  EntityId extends PropertyKey,
  Mode,
> = {
  addEntity: AddEntityAction<Machine, EntityId, Mode>;
  removeEntity: (entityId: EntityId) => void;
};

type CollectionAdjustContext<
  Machine extends AnyMachine,
  EntityId extends PropertyKey,
  Mode,
> = {
  collection: CollectionMap<Machine, EntityId>;
  eventActions: EventActions<Machine, [entityId: EntityId]>;
  lifecycleActions: LifecycleActions<Machine, EntityId, Mode>;
  set: StoreApi<UnknownStore>['setState'];
  get: StoreApi<UnknownStore>['getState'];
};

type DefaultCollectionSlice<
  Machine extends AnyMachine,
  EntityId extends PropertyKey,
  Mode,
  NestingPath extends string,
> = NestAt<NestingPath, CollectionMap<Machine, EntityId>> &
  LifecycleActions<Machine, EntityId, Mode> &
  EventActions<Machine, [entityId: EntityId]>;

type CollectionSlice<
  Machine extends AnyMachine,
  EntityId extends PropertyKey,
  Mode,
  NestingPath extends string,
  AdjustResult,
> = [AdjustResult] extends [never]
  ? DefaultCollectionSlice<Machine, EntityId, Mode, NestingPath>
  : AdjustResult;

export const toCollectionStore = <
  Machine extends AnyMachine,
  SelectedEntityId extends PropertyKey = never,
  NestingPath extends string = 'collection',
  AdjustResult = never,
>(
  machine: Machine,
  {
    nestingPath = 'collection' as NestingPath,
    selectIdFromData,
    adjust,
  }: {
    nestingPath?: NestingPath;
    selectIdFromData?: (data: DataOfMachine<Machine>) => SelectedEntityId;
    adjust?: (
      context: CollectionAdjustContext<
        Machine,
        EntityIdFor<SelectedEntityId>,
        ModeFor<SelectedEntityId>
      >,
    ) => AdjustResult;
  } = {},
) => {
  type EntityId = EntityIdFor<SelectedEntityId>;
  type Mode = ModeFor<SelectedEntityId>;
  type Collection = CollectionMap<Machine, EntityId>;
  type State = StateOfMachine<Machine>;

  const pathKeys = splitPath(nestingPath);

  type Slice = CollectionSlice<
    Machine,
    EntityId,
    Mode,
    NestingPath,
    AdjustResult
  >;

  return <StoreState extends Slice>(
    set: StoreApi<StoreState>['setState'],
    get: StoreApi<StoreState>['getState'],
    _store: StoreApi<StoreState>,
  ): Slice => {
    const setStore = set as StoreApi<UnknownStore>['setState'];
    const getStore = get as StoreApi<UnknownStore>['getState'];

    const readCollection = (store: UnknownStore) =>
      getAtPath<Collection>(store, pathKeys);

    const eventActions = Object.fromEntries(
      Object.keys(machine.event).map(eventName => [
        eventName,
        (entityId: EntityId, payload?: unknown) =>
          setStore(store => {
            const collection = readCollection(store);
            const current = collection[entityId];
            if (!current) return store;
            const next = machine.transition(
              current,
              machine.event[eventName]!(payload),
            );
            return setAtPath(store, pathKeys, {
              ...collection,
              [entityId]: next,
            });
          }),
      ]),
    ) as EventActions<Machine, [entityId: EntityId]>;

    const addEntity = (...args: [State] | [EntityId, State]) => {
      const [entityId, state] = selectIdFromData
        ? [
            selectIdFromData(
              (args[0] as State & { data: unknown })
                .data as DataOfMachine<Machine>,
            ),
            args[0] as State,
          ]
        : (args as [EntityId, State]);
      setStore(store => {
        const collection = readCollection(store);
        return setAtPath(store, pathKeys, { ...collection, [entityId]: state });
      });
    };

    const removeEntity = (entityId: EntityId) =>
      setStore(store => {
        const { [entityId]: _removed, ...rest } = readCollection(store);
        return setAtPath(store, pathKeys, rest);
      });

    const lifecycleActions = {
      addEntity,
      removeEntity,
    } as LifecycleActions<Machine, EntityId, Mode>;

    if (adjust) {
      return adjust({
        collection: readCollection(getStore()) ?? {},
        eventActions,
        lifecycleActions,
        set: setStore,
        get: getStore,
      }) as Slice;
    }

    return {
      ...setAtPath<UnknownStore>({}, pathKeys, {}),
      ...lifecycleActions,
      ...eventActions,
    } as Slice;
  };
};
