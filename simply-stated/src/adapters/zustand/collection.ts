import type { AnyMachine } from '../../simply-stated';
import type { SetAtPath } from '../../type-utils';
import { getAtPath, setAtPath, splitPath } from '../../utils';
import type {
  MachineActions,
  GuardPlacement,
  GuardPlacedInitializer,
  SliceInitializerWithPath,
  SliceInitializer,
} from './shared';
import type {
  DataOfMachine,
  EntityIdFor,
  ModeFor,
  StateOfMachine,
} from '../shared';

type EntityIdType = number | string;

type SliceStateCollection<
  Machine extends AnyMachine,
  EntityId extends EntityIdType,
> = Partial<Record<EntityId, StateOfMachine<Machine>>>;

type AddEntityAction<
  Machine extends AnyMachine,
  EntityId extends EntityIdType,
  Mode,
> = Mode extends 'data'
  ? (state: StateOfMachine<Machine>) => void
  : (entityId: EntityId, state: StateOfMachine<Machine>) => void;

type LifecycleActions<
  Machine extends AnyMachine,
  EntityId extends EntityIdType,
  Mode,
> = {
  addEntity: AddEntityAction<Machine, EntityId, Mode>;
  removeEntity: (entityId: EntityId) => void;
};

type CollectionSliceAdjustContext<
  Machine extends AnyMachine,
  EntityId extends EntityIdType,
  Mode,
> = {
  machineActions: MachineActions<Machine, [entityId: EntityId]>;
  lifecycleActions: LifecycleActions<Machine, EntityId, Mode>;
};

type CollectionSliceActions<
  Machine extends AnyMachine,
  EntityId extends EntityIdType,
  Mode,
  AdjustResult,
> = [AdjustResult] extends [never]
  ? LifecycleActions<Machine, EntityId, Mode> &
      MachineActions<Machine, [entityId: EntityId]>
  : AdjustResult;

type CollectionSlice<
  Machine extends AnyMachine,
  EntityId extends EntityIdType,
  Mode,
  SlicePath extends string,
  AdjustResult,
> = SetAtPath<
  CollectionSliceActions<Machine, EntityId, Mode, AdjustResult>,
  SlicePath,
  SliceStateCollection<Machine, EntityId>
>;

type CollectionSliceInitializer<
  Machine extends AnyMachine,
  EntityId extends EntityIdType,
  Mode,
  CollectionPath extends string,
  AdjustResult,
  Slice = CollectionSlice<
    Machine,
    EntityId,
    Mode,
    CollectionPath,
    AdjustResult
  >,
> = GuardPlacedInitializer<
  CollectionSliceActions<Machine, EntityId, Mode, never>,
  AdjustResult,
  CollectionPath,
  'collection',
  SliceInitializerWithPath<Slice, CollectionPath>
>;

export const toCollectionStore = <
  Machine extends AnyMachine,
  SelectedEntityId extends EntityIdType = never,
  CollectionPath extends string = 'collection',
  AdjustResult = never,
>(
  machine: Machine,
  {
    collectionPath = 'collection' as CollectionPath,
    selectIdFromData,
    adjustActions,
  }: {
    collectionPath?: CollectionPath;
    selectIdFromData?: (data: DataOfMachine<Machine>) => SelectedEntityId;
    adjustActions?: (
      context: CollectionSliceAdjustContext<
        Machine,
        EntityIdFor<SelectedEntityId>,
        ModeFor<SelectedEntityId>
      >,
    ) => AdjustResult;
  } & GuardPlacement<
    CollectionSliceActions<
      Machine,
      EntityIdFor<SelectedEntityId>,
      ModeFor<SelectedEntityId>,
      never
    >,
    AdjustResult,
    CollectionPath,
    'collectionPath'
  > = {},
) => {
  type EntityId = EntityIdFor<SelectedEntityId>;
  type Mode = ModeFor<SelectedEntityId>;
  type Collection = SliceStateCollection<Machine, EntityId>;
  type State = StateOfMachine<Machine>;
  type Slice = CollectionSlice<
    Machine,
    EntityId,
    Mode,
    CollectionPath,
    AdjustResult
  >;

  const stateCollectionPathKeys = splitPath(collectionPath);

  const initializer: SliceInitializer<Slice> = set => {
    const extractCollection = (slice: Slice) =>
      getAtPath<Collection>(slice, stateCollectionPathKeys);

    const machineActions = Object.fromEntries(
      Object.keys(machine.event).map(eventName => [
        eventName,
        (entityId: EntityId, payload?: unknown) =>
          set(store => {
            const collection = extractCollection(store);
            const current = collection[entityId];
            if (!current) return store;
            const next = machine.transition(
              current,
              machine.event[eventName]!(payload),
            );
            return setAtPath(store, stateCollectionPathKeys, {
              ...collection,
              [entityId]: next,
            });
          }),
      ]),
    ) as MachineActions<Machine, [entityId: EntityId]>;

    const addEntity = (...args: [State] | [EntityId, State]) => {
      let derivedParams: [EntityId, State];
      if (selectIdFromData) {
        const state = args[0] as State & { data: DataOfMachine<Machine> };
        const entityId = selectIdFromData(state.data) as EntityId;
        derivedParams = [entityId, state];
      } else {
        derivedParams = args as [EntityId, State];
      }

      const [entityId, state] = derivedParams;
      set(store => {
        const collection = extractCollection(store);
        return setAtPath(store, stateCollectionPathKeys, {
          ...collection,
          [entityId]: state,
        });
      });
    };

    const removeEntity = (entityId: EntityId) =>
      set(store => {
        const { [entityId]: _removed, ...rest } = extractCollection(store);
        return setAtPath(store, stateCollectionPathKeys, rest);
      });

    const lifecycleActions = {
      addEntity,
      removeEntity,
    } as LifecycleActions<Machine, EntityId, Mode>;

    const actions = adjustActions
      ? adjustActions({ machineActions, lifecycleActions })
      : { ...lifecycleActions, ...machineActions };

    return setAtPath<Slice>(actions, stateCollectionPathKeys, {});
  };

  return initializer as CollectionSliceInitializer<
    Machine,
    EntityId,
    Mode,
    CollectionPath,
    AdjustResult
  >;
};
