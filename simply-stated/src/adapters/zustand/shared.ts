import type { AnyMachine, EventPayloadOf, StateOf } from '../../simply-stated';

// NestAt / StateOfMachine mirror the RTK adapter's helpers of the same name.
// They are re-declared here (rather than imported) so the zustand subpath does
// not pull in the RTK adapter module, which references @reduxjs/toolkit types.
export type StateOfMachine<Machine extends AnyMachine> = StateOf<
  Machine['state']
>;

export type NestAt<Path extends string | undefined, Value> = Path extends string
  ? Path extends `${infer Head}.${infer Rest}`
    ? { [K in Head]: NestAt<Rest, Value> }
    : { [K in Path]: Value }
  : Value;

export type UnknownStore = Record<string, unknown>;

export type EventActions<
  Machine extends AnyMachine,
  LeadingArgs extends readonly unknown[] = [],
> = {
  [EventName in keyof Machine['event']]: [
    EventPayloadOf<Machine['event'][EventName]>,
  ] extends [never]
    ? (...args: LeadingArgs) => void
    : (
        ...args: [
          ...LeadingArgs,
          payload: EventPayloadOf<Machine['event'][EventName]>,
        ]
      ) => void;
};
