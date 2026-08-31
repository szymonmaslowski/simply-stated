import type { AnyMachine, StateOfMachine } from '../simply-stated';

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
