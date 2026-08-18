import type { AnyMachine } from '../../simply-stated';
import type { SetAtPath } from '../../type-utils';
import { getAtPath, setAtPath, splitPath } from '../../utils';
import type { StateOfMachine } from '../shared';
import type {
  MachineActions,
  GuardPlacement,
  GuardPlacedInitializer,
  SliceInitializerWithPath,
  SliceInitializer,
} from './shared';

type SingleInstanceSliceAdjustContext<Machine extends AnyMachine> = {
  machineActions: MachineActions<Machine>;
};

type SingleInstanceSliceActions<Machine extends AnyMachine, AdjustResult> = [
  AdjustResult,
] extends [never]
  ? MachineActions<Machine>
  : AdjustResult;

type SingleInstanceSlice<
  Machine extends AnyMachine,
  State,
  StatePath extends string,
  AdjustResult,
> = SetAtPath<
  SingleInstanceSliceActions<Machine, AdjustResult>,
  StatePath,
  State
>;

type SingleInstanceSliceInitializer<
  Machine extends AnyMachine,
  State,
  StatePath extends string,
  AdjustResult,
  Slice = SingleInstanceSlice<Machine, State, StatePath, AdjustResult>,
> = GuardPlacedInitializer<
  SingleInstanceSliceActions<Machine, never>,
  AdjustResult,
  StatePath,
  'state',
  SliceInitializerWithPath<Slice, StatePath>
>;

export const toStore = <
  Machine extends AnyMachine,
  State extends StateOfMachine<Machine>,
  StatePath extends string = 'state',
  AdjustResult = never,
>(
  machine: Machine,
  {
    initialState,
    statePath = 'state' as StatePath,
    adjustActions,
  }: {
    initialState: NoInfer<State>;
    statePath?: StatePath;
    adjustActions?: (
      context: SingleInstanceSliceAdjustContext<Machine>,
    ) => AdjustResult;
  } & GuardPlacement<
    SingleInstanceSliceActions<Machine, never>,
    AdjustResult,
    StatePath,
    'statePath'
  >,
) => {
  const pathKeys = splitPath(statePath);

  type Slice = SingleInstanceSlice<Machine, State, StatePath, AdjustResult>;

  const initializer: SliceInitializer<Slice> = set => {
    const machineActions = Object.fromEntries(
      Object.keys(machine.event).map(eventName => [
        eventName,
        (payload?: unknown) =>
          set(store => {
            const current = getAtPath<State>(store, pathKeys);
            const next = machine.transition(
              current,
              machine.event[eventName]!(payload),
            );
            return setAtPath(store, pathKeys, next);
          }),
      ]),
    ) as MachineActions<Machine>;

    const actions = adjustActions
      ? adjustActions({ machineActions })
      : machineActions;

    return setAtPath<Slice>(actions, pathKeys, initialState);
  };

  return initializer as SingleInstanceSliceInitializer<
    Machine,
    State,
    StatePath,
    AdjustResult
  >;
};
