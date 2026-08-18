import type { StateCreator as ZustandStateCreator } from 'zustand/vanilla';
import type { UsageGuardError } from '../../simply-stated';
import type {
  ConflictPaths,
  ConflictsAtPath,
  DeepMerge,
  EmptyObject,
  JoinStrings,
  OmitAtPath,
  UnionToTuple,
} from '../../type-utils';
import { deepMerge } from '../../utils';
import type {
  GetPathOfInitializer,
  SliceInitializer,
  SliceInitializerWithPath,
} from './shared';

type SliceOfInitializer<Initializer> = Initializer extends (
  ...args: never[]
) => infer Slice
  ? Slice
  : never;

type OmitPaths<
  Shape,
  Paths extends readonly string[],
> = Paths extends readonly [
  infer First extends string,
  ...infer Rest extends readonly string[],
]
  ? OmitPaths<OmitAtPath<Shape, First>, Rest>
  : Shape;

type NoStateSlice<Initializer> = OmitPaths<
  SliceOfInitializer<Initializer>,
  UnionToTuple<GetPathOfInitializer<Initializer>>
>;

type PathsClaimedIn<Shape, Paths extends string> = Paths extends unknown
  ? ConflictsAtPath<Shape, Paths> extends true
    ? Paths
    : never
  : never;

type ClashesFor<Initializer, SeenPaths extends string, SeenNoStateChunk> =
  | Extract<GetPathOfInitializer<Initializer>, SeenPaths>
  | PathsClaimedIn<SeenNoStateChunk, GetPathOfInitializer<Initializer>>
  | PathsClaimedIn<NoStateSlice<Initializer>, SeenPaths>
  // Both operands are resolved through `infer` before `ConflictPaths` sees
  // them. Handed two unresolved type parameters it walks their keys eagerly on
  // TypeScript 7 and trips TS2589; pinning each to a concrete object first
  // defers the walk to the call site, where the shapes are known.
  | (NoStateSlice<Initializer> extends infer NoState extends object
      ? SeenNoStateChunk extends infer Seen extends object
        ? ConflictPaths<NoState, Seen>
        : never
      : never);

type CheckSlice<
  Initializer,
  SeenPaths extends string,
  SeenNoStateChunk,
  Clashes extends string = ClashesFor<Initializer, SeenPaths, SeenNoStateChunk>,
> = [Clashes] extends [never]
  ? Initializer
  : UsageGuardError<`An earlier slice already defines ${JoinStrings<
      UnionToTuple<Clashes>,
      ', ',
      "'"
    >}`>;

type ValidateSlices<
  Initializers extends readonly unknown[],
  SeenPaths extends string = never,
  SeenNoStateChunk = EmptyObject,
  Checked extends readonly unknown[] = [],
> = Initializers extends readonly [infer First, ...infer Rest]
  ? ValidateSlices<
      Rest,
      SeenPaths | GetPathOfInitializer<First>,
      DeepMerge<SeenNoStateChunk, NoStateSlice<First>>,
      [...Checked, CheckSlice<First, SeenPaths, SeenNoStateChunk>]
    >
  : Checked;

type CombinedSlice<Initializers extends readonly unknown[]> =
  Initializers extends readonly [infer First, ...infer Rest]
    ? Rest extends readonly []
      ? SliceOfInitializer<First>
      : DeepMerge<SliceOfInitializer<First>, CombinedSlice<Rest>>
    : EmptyObject;

type CombinedPaths<Initializers extends readonly unknown[]> =
  Initializers extends readonly [infer First, ...infer Rest]
    ? GetPathOfInitializer<First> | CombinedPaths<Rest>
    : never;

type CombinedInitializer<
  Initializers extends readonly unknown[],
  Slice = CombinedSlice<Initializers>,
> = SliceInitializerWithPath<
  Slice,
  // Carrying every nested path forward to let combined initializers be
  // combined again without losing clash detection across the nesting.
  CombinedPaths<Initializers>
>;

export const combineSlices = <
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Initializers extends readonly ZustandStateCreator<any>[],
>(
  ...initializers: Initializers & ValidateSlices<Initializers>
) => {
  type Slice = CombinedSlice<Initializers>;

  const initializer: SliceInitializer<Slice> = (set, get, store) =>
    initializers.reduce(
      (merged, slice) => deepMerge(merged, slice(set, get, store)),
      {} as Slice,
    );

  return initializer as CombinedInitializer<Initializers>;
};
