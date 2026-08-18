import type { StateCreator } from 'zustand/vanilla';
import type {
  AnyMachine,
  EventPayloadOf,
  UsageGuardError,
} from '../../simply-stated';
import type {
  ConflictsAtPath,
  EmptyObject,
  GetTagMetadata,
  Tagged,
} from '../../type-utils';

export type SliceInitializer<Slice> = <StoreState extends Slice>(
  ...args: Parameters<StateCreator<StoreState>>
) => Slice;

export type SliceInitializerWithPath<
  Slice,
  NestingPath extends string,
> = Tagged<SliceInitializer<Slice>, 'Path', NestingPath>;

export type GetPathOfInitializer<Initializer> =
  Initializer extends SliceInitializerWithPath<unknown, string>
    ? GetTagMetadata<Initializer, 'Path'>
    : never;

// The clash is reported on the option that caused it, so the error lands on the
// argument rather than downstream at `create`: on `adjustActions` when one is
// supplied (its shape is what claimed the slot), otherwise on the path option
// itself. Making the property required is what forces the error — when the path
// option is also omitted TypeScript reports it as missing, which still names the
// clash and still points at the knob that fixes it.
//
// The message is spelled out in both branches rather than shared through an
// alias, which TypeScript would print by name instead of expanding.
export type GuardPlacement<
  DefaultActions,
  AdjustResult,
  Path extends string,
  PathOptionName extends string,
> = [AdjustResult] extends [never]
  ? ConflictsAtPath<DefaultActions, Path> extends true
    ? {
        [Key in PathOptionName]: UsageGuardError<`Naming clash at path '${Path}'`>;
      }
    : EmptyObject
  : ConflictsAtPath<AdjustResult, Path> extends true
    ? {
        adjustActions: UsageGuardError<`Naming clash at path '${Path}'`>;
      }
    : EmptyObject;

// Backstop for the one placement the option guard cannot reach: when the whole
// options argument is omitted there is no property to make required. That is
// only possible while the path is still its default, so the check is gated on
// that — a path the caller spelled out is already reported on the option itself,
// and guarding it here too would report the same clash twice.
export type GuardPlacedInitializer<
  DefaultActions,
  AdjustResult,
  Path extends string,
  DefaultPath extends string,
  Initializer,
> = [AdjustResult] extends [never]
  ? [Path] extends [DefaultPath]
    ? ConflictsAtPath<DefaultActions, Path> extends true
      ? UsageGuardError<`Naming clash at path '${Path}'`>
      : Initializer
    : Initializer
  : Initializer;

export type MachineActions<
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
