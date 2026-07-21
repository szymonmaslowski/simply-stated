/* eslint-disable @typescript-eslint/no-explicit-any */

// Vendored from type-fest (https://github.com/sindresorhus/type-fest), which is
// dual-licensed `(MIT OR CC0-1.0)`; these copies are taken under CC0-1.0.

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
