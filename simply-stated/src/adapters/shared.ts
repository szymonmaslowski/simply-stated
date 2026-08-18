import type { AnyMachine } from '../simply-stated';
import type { Simplify } from '../type-utils';

// Not `StateOf`: its tooltip-friendly tail stays deferred while `Machine` is
// unresolved, and the adapters need an object type here.
export type StateOfMachine<Machine extends AnyMachine> = Simplify<
  ReturnType<Machine['state'][keyof Machine['state']]>
>;

export type DataOfMachine<Machine extends AnyMachine> = [
  StateOfMachine<Machine>,
] extends [{ data: infer Data }]
  ? Data
  : never;

export type ModeFor<SelectedEntityId> = [SelectedEntityId] extends [never]
  ? 'explicit'
  : 'data';

export type EntityIdFor<SelectedEntityId> = [SelectedEntityId] extends [never]
  ? string
  : SelectedEntityId;
