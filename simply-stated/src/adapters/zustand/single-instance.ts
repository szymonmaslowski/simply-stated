import type { StoreApi } from 'zustand/vanilla';
import { getAtPath, setAtPath, splitPath } from '../../path';
import type { AnyMachine } from '../../simply-stated';
import type {
  EventActions,
  NestAt,
  StateOfMachine,
  UnknownStore,
} from './shared';

type SingleAdjustContext<Machine extends AnyMachine, State> = {
  state: State;
  eventActions: EventActions<Machine>;
  set: StoreApi<UnknownStore>['setState'];
  get: StoreApi<UnknownStore>['getState'];
};

type DefaultSingleSlice<
  Machine extends AnyMachine,
  State,
  NestingPath extends string,
> = NestAt<NestingPath, State> & EventActions<Machine>;

type SingleSlice<
  Machine extends AnyMachine,
  State,
  NestingPath extends string,
  AdjustResult,
> = [AdjustResult] extends [never]
  ? DefaultSingleSlice<Machine, State, NestingPath>
  : AdjustResult;

export const toStore = <
  Machine extends AnyMachine,
  State extends StateOfMachine<Machine>,
  NestingPath extends string = 'state',
  AdjustResult = never,
>(
  machine: Machine,
  {
    initialState,
    nestingPath = 'state' as NestingPath,
    adjust,
  }: {
    initialState: NoInfer<State>;
    nestingPath?: NestingPath;
    adjust?: (context: SingleAdjustContext<Machine, State>) => AdjustResult;
  },
) => {
  const pathKeys = splitPath(nestingPath);

  type Slice = SingleSlice<Machine, State, NestingPath, AdjustResult>;

  return <StoreState extends Slice>(
    set: StoreApi<StoreState>['setState'],
    get: StoreApi<StoreState>['getState'],
    _store: StoreApi<StoreState>,
  ): Slice => {
    const setStore = set as StoreApi<UnknownStore>['setState'];
    const getStore = get as StoreApi<UnknownStore>['getState'];

    const eventActions = Object.fromEntries(
      Object.keys(machine.event).map(eventName => [
        eventName,
        (payload?: unknown) =>
          setStore(store => {
            const current = getAtPath<State>(store, pathKeys);
            const next = machine.transition(
              current,
              machine.event[eventName]!(payload),
            );
            return setAtPath(store, pathKeys, next);
          }),
      ]),
    ) as EventActions<Machine>;

    if (adjust) {
      return adjust({
        state: initialState,
        eventActions,
        set: setStore,
        get: getStore,
      }) as Slice;
    }

    return {
      ...setAtPath<UnknownStore>({}, pathKeys, initialState),
      ...eventActions,
    } as Slice;
  };
};
