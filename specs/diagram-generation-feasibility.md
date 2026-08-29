# Diagram generation — feasibility

**Status: built.** The seed lives in `simply-stated-diagram/` — extractor, CLI
(`--format json|mermaid|html`), Mermaid and standalone-HTML renderers. What
follows is the evaluation that led there; the open items are the ones listed
under Known limits.

**Verdict: feasible, and cheaper than expected.** A working extractor prototype
(~55 lines, TypeScript compiler API only) already produced correct graphs —
including branch-dependent target states — for every machine shape in this repo.

## Key finding: don't analyse control flow, ask the compiler

The naive plan (walk handler bodies, resolve `if` / ternary / `switch` branches
into a target set) is the expensive part of a static analyser and the part that
silently goes wrong. It is unnecessary here: every handler is
`(data, payload?) => nextState`, and TypeScript **already** infers the union of
all returned state objects. `signature.getReturnType()` on the handler is the
complete set of reachable target states, computed by the compiler, for free.

Verified against:

| handler shape                                       | extracted targets                |
| --------------------------------------------------- | -------------------------------- |
| `(data, value) => state.Success({...})`             | `Success`                        |
| `if (data.retries < 3) return ...; return ...`      | `Fetching \| Failure`            |
| `ok ? state.Success(...) : state.Idle()`            | `Idle \| Success`                |
| `switch (kind) { case 'a': ... default: ... }`      | `Idle \| Done`                   |
| delegated to a helper: `data => decide(data)`       | `Running \| Done`                |
| `'*'` cross-state group                             | handled, payload read from arg 0 |
| `...forwardEvents(inner, state.Open, d => d.light)` | `Open -> Open` per inner event   |

Payload types come from the same signature (`parameters[1]`, or `[0]` for `'*'`).

## Machine detection

Machines are branded — `Tagged<..., 'MachineTree', Tree>` — so the whole tree is
recoverable from the _type_ of any machine value:

```js
const tagSymbol = machineType
  .getProperties()
  .find(s => s.getName().startsWith('__@tag'));
const treeType = checker.getTypeOfSymbolAtLocation(
  checker.getTypeOfSymbolAtLocation(tagSymbol, node).getProperty('MachineTree'),
  node,
);
```

This means detection needs no call-site pattern matching. It works for
`combineStates(...).createMachine(...)`, for destructured
`const { state, createMachine } = combineStates(...)`, for machines built by a
factory, and for machines merely _imported_ into the pointed-at file. All four
were verified.

AST work stays optional and additive: locating the `createMachine` call gives
source lines for deep-links, and spread properties reveal `forwardEvents(inner,
...)` so an inner machine can be drawn as a subgraph instead of a self-loop.

## Prototype output (real, not sketched)

```
== machine.ts:fetchMachine ==
Idle --fetch({ query: string; })--> Fetching
Fetching --resolved(string)--> Success
Fetching --rejected(string)--> Fetching | Failure
Fetching --settled(boolean)--> Idle | Success
Success --refetch(—)--> Fetching
Failure --retry(—)--> Fetching
* --reset(—)--> Idle

== nested.ts:crossingMachine ==
Open --close(—)--> Closed
Open --go(—)--> Open          (via forwardEvents(lightMachine))
Open --stop(—)--> Open        (via forwardEvents(lightMachine))
Closed --open(—)--> Open

== edge.ts:edgeMachine ==
Idle --start(string)--> Running
Running --tick(—)--> Running | Done      (delegated to helper)
Running --switchy("a" | "b")--> Idle | Done
Done: (terminal)
```

## Approaches considered

- **Runtime import + introspection** — rejected. The tree is closed over inside
  `transition`; only `state` and `event` maps are reachable. Even after exposing
  the tree, calling handlers requires fabricating `data`, and branch coverage
  would depend on the fabricated values.
- **Pure AST control-flow analysis** — rejected. Reimplements what the checker
  does, breaks on helper delegation, spreads and imported trees.
- **Type-driven extraction (compiler API)** — recommended. Matches the library's
  premise: the truth already lives in the types.

## Known limits (all detectable, all reportable)

1. **Widened handler annotations.** `bail: (): StateOf<typeof state> => ...`
   yields every state as a target. Verified: `Running --bail--> Idle | Running |
Done`. Mitigation — warn when a handler's target set equals the full state
   set.
2. **Dynamically built trees** (computed keys, `Object.fromEntries`) lose literal
   keys and produce an index signature. Detect and warn rather than emit a wrong
   graph.
3. **`any` payloads** print as `any`; nothing to do.
4. **No initial state in the model.** The machine has no notion of one, so the
   diagram cannot mark an entry node. Options: a CLI flag, a JSDoc tag on the
   machine, or inferring from adapter call sites (`toSliceOptions(machine, {
initialState })`). Worth deciding before the diagram format is fixed.
5. **Needs a tsconfig** and a program build — seconds on a real project.
   Mitigate with `--tsconfig` and file-scoped programs.
6. **TS as a peer dependency.** Consumers already have it.

## Free bonus analyses

Once the graph exists: unreachable states, states with no outgoing events,
events never reachable from an initial state, `'*'` handlers shadowed by
per-state handlers.

## Packaging

Keep the core package zero-dependency. Ship the tool as a separate workspace
package — `simply-stated-diagram`, `bin: simply-stated-diagram`, `peerDependencies:
{ typescript: '>=5.7' }`, reusing the existing tsdown/vitest setup.

```
simply-stated-diagram <file.ts> [--tsconfig p] [--out diagram.html]
                                [--format html|mermaid|json|dot] [--machine name]
```

`--format json` first: it is the stable contract the renderers and the tests are
written against.

Rendering: emit Mermaid `stateDiagram-v2` and inline a bundled mermaid runtime
into a self-contained HTML file. Layout is solved, output is one file, no
network. A hand-rolled ELK/dagre + SVG renderer is a later upgrade if the
Mermaid look is limiting.

## Effort

| Scope                                                                                     | Estimate  |
| ----------------------------------------------------------------------------------------- | --------- |
| MVP — extractor, JSON + Mermaid + standalone HTML, CLI, fixtures/tests                    | 1–2 days  |
| Nested-machine subgraphs, guard labels from inline bodies, data shapes, source deep-links | +2–3 days |
| Watch mode, multi-machine pages, editor preview                                           | later     |

Guard labels are the only genuinely partial feature: the target _set_ is always
exact (from types), but the _condition text_ per edge is only recoverable when
the handler body is inline — a walk from each `return` up through its enclosing
`if` / ternary / `case` gives the label. Delegated handlers get an unlabelled
edge. Type-derived targets stay authoritative; labels are decoration.

## Recommendation

Build it. Start with the extractor plus `--format json`, pin behaviour with
fixture machines covering the seven handler shapes in the table above, then add
renderers. The risky-sounding part of the original plan (branch analysis) is the
part TypeScript hands over for free.
