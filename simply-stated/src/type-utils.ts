/* eslint-disable @typescript-eslint/no-explicit-any */

// Some of the utils has been vendored from type-fest (https://github.com/sindresorhus/type-fest),
// which is dual-licensed `(MIT OR CC0-1.0)`; these copies are taken under CC0-1.0.

export type AsTuple<
  T extends readonly unknown[],
  R extends readonly unknown[] = [],
> = number extends T['length']
  ? T
  : R['length'] extends T['length']
    ? R
    : AsTuple<T, [...R, T[R['length']]]>;

export type Flatten<
  T extends readonly unknown[],
  R extends readonly unknown[] = [],
> = T extends readonly [infer Head, ...infer Rest extends readonly unknown[]]
  ? Head extends readonly unknown[]
    ? Flatten<Rest, readonly [...R, ...AsTuple<Head>]>
    : Flatten<Rest, readonly [...R, Head]>
  : R;

export declare const tag: unique symbol;

type TagContainer<Token> = {
  readonly [tag]: Token;
};

type Tag<Token extends PropertyKey, TagMetadata> = TagContainer<{
  [K in Token]: TagMetadata;
}>;

export type Tagged<
  Type,
  TagName extends PropertyKey,
  TagMetadata = never,
> = Type & Tag<TagName, TagMetadata>;

export type GetTagMetadata<
  Type extends Tag<TagName, unknown>,
  TagName extends PropertyKey,
> = Type[typeof tag][TagName];

export type Simplify<T> = { [KeyType in keyof T]: T[KeyType] } & {};

export type EmptyObject = Record<never, never>;

export type IsAny<T> = 0 extends 1 & NoInfer<T> ? true : false;

export type IsNever<T> = [T] extends [never] ? true : false;

export type IsEqual<A, B> = [A] extends [B]
  ? [B] extends [A]
    ? IsIdentical<A, B>
    : false
  : false;

// Relies on conditional-type identity checks being deferred for unresolved type
// parameters, which makes the two signatures compare equal only when A and B are
// identical. See microsoft/TypeScript#27024.
type IsIdentical<A, B> =
  (<G>() => G extends (A & G) | G ? 1 : 2) extends <G>() => G extends
    | (B & G)
    | G
    ? 1
    : 2
    ? true
    : false;

export type IsUnion<T> = InternalIsUnion<T>;

type InternalIsUnion<T, Original = T> = (
  IsNever<T> extends true
    ? false
    : T extends any
      ? IsEqual<Original, T> extends true
        ? false
        : true
      : never
) extends infer Result
  ? // A distributed `false | true` widens to `boolean`, which means T had at
    // least two members.
    boolean extends Result
    ? true
    : Result
  : never;

export type UnionToIntersection<Union> = (
  Union extends unknown ? (distributedUnion: Union) => void : never
) extends (mergedIntersection: infer Intersection) => void
  ? // `& Union` keeps the result assignable back to the input union.
    Intersection & Union
  : never;

type LastOfUnion<Union> =
  UnionToIntersection<
    Union extends unknown ? () => Union : never
  > extends () => infer Last
    ? Last
    : never;

// Union order is a TypeScript implementation detail, so the resulting order is
// unspecified — fine for the human-read error messages this feeds.
export type UnionToTuple<Union extends string, Result extends string[] = []> = [
  Union,
] extends [never]
  ? Result
  : LastOfUnion<Union> extends infer Last extends string
    ? UnionToTuple<Exclude<Union, Last>, [Last, ...Result]>
    : never;

export type JoinStrings<
  Parts extends readonly string[],
  Separator extends string,
  Wrapper extends string,
> = Parts extends readonly [
  infer Head extends string,
  ...infer Rest extends readonly string[],
]
  ? Rest extends readonly []
    ? `${Wrapper}${Head}${Wrapper}`
    : `${Wrapper}${Head}${Wrapper}${Separator}${JoinStrings<Rest, Separator, Wrapper>}`
  : '';

type AnyFunction = (...args: never[]) => unknown;

type SharedKeys<Left, Right> = Extract<keyof Left & keyof Right, string>;

export type SetAtPath<
  Target,
  Path extends string,
  Value,
> = Path extends `${infer Head}.${infer Rest}`
  ? Simplify<
      Omit<Target, Head> & {
        [Key in Head]: SetAtPath<
          Head extends keyof Target ? Target[Head] : EmptyObject,
          Rest,
          Value
        >;
      }
    >
  : Path extends ''
    ? Value
    : Simplify<Omit<Target, Path> & { [Key in Path]: Value }>;

export type OmitAtPath<
  Shape,
  Path extends string,
> = Path extends `${infer Head}.${infer Rest}`
  ? Head extends keyof Shape
    ? Simplify<
        Omit<Shape, Head> & { [Key in Head]: OmitAtPath<Shape[Head], Rest> }
      >
    : Shape
  : Simplify<Omit<Shape, Path>>;

// Two branches merge only while both sides are objects and their keys stay
// disjoint; anything else claimed twice is reported as the path that carries it.
export type ConflictPaths<Left, Right, Prefix extends string = ''> = {
  [Key in SharedKeys<Left, Right>]: Left[Key] extends AnyFunction
    ? `${Prefix}${Key}`
    : Right[Key] extends AnyFunction
      ? `${Prefix}${Key}`
      : Left[Key] extends object
        ? Right[Key] extends object
          ? ConflictPaths<Left[Key], Right[Key], `${Prefix}${Key}.`>
          : `${Prefix}${Key}`
        : `${Prefix}${Key}`;
}[SharedKeys<Left, Right>];

export type ConflictsAtPath<Shape, Path extends string> =
  IsNever<
    ConflictPaths<Shape, SetAtPath<EmptyObject, Path, unknown>>
  > extends true
    ? false
    : true;

export type DeepMerge<Left, Right> = Simplify<{
  [Key in keyof Left | keyof Right]: Key extends keyof Right
    ? Key extends keyof Left
      ? Left[Key] extends AnyFunction
        ? Right[Key]
        : Right[Key] extends AnyFunction
          ? Right[Key]
          : Left[Key] extends object
            ? Right[Key] extends object
              ? DeepMerge<Left[Key], Right[Key]>
              : Right[Key]
            : Right[Key]
      : Right[Key]
    : Key extends keyof Left
      ? Left[Key]
      : never;
}>;
