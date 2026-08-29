# simply-stated-diagram

Generates state machine diagrams from `simply-stated` sources: a CLI that reads
your TypeScript and emits JSON, Mermaid, or a self-contained HTML page.

Not published yet — private workspace package.

## CLI

```bash
simply-stated-diagram [file...] [options]

  --tsconfig <path>   tsconfig to build the program from (default: nearest one)
  --format <format>   json | mermaid | html (default: json)
  --machine <name>    only this machine (repeatable)
  --out <path>        write to a file instead of stdout
  -h, --help          show this message
```

```bash
# every machine the project's tsconfig sees, as JSON
simply-stated-diagram

# one machine, as a Mermaid state diagram
simply-stated-diagram src/machines/fetch.ts --machine fetchMachine --format mermaid

# a standalone page you can open offline
simply-stated-diagram --format html --out diagrams.html
```

The HTML page inlines the Mermaid runtime, so it renders with no network access
and no build step. Every machine gets a diagram plus a table of events, payload
types and target states.

## Library

```ts
import {
  createProgramFromTsconfig,
  extractMachines,
  renderHtml,
  renderMermaid,
} from 'simply-stated-diagram';

const graphs = extractMachines(createProgramFromTsconfig('./tsconfig.json'));
// [{ name, sourceFile, states: [{ name, transitions: [{ event, payload, targets }] }] }]

renderMermaid(graphs[0]); // stateDiagram-v2 source
renderHtml(graphs); // standalone page
```

## Why it works this way

Machines are branded (`Tagged<…, 'MachineTree', Tree>`), so the transition tree
is recoverable from the _type_ of any machine value — no call-site pattern
matching, and imported or factory-built machines work the same as inline ones.

Handler target states come from the handler's inferred return type. TypeScript
already unions every returned state, so `if`, ternaries, `switch` and delegation
to a helper all resolve without any control-flow analysis of our own.

## Known limits

- A handler annotated with a widened return type (e.g. `StateOf<typeof state>`)
  reports every state as a target. Real, and visible in the tests.
- Dynamically built trees (computed keys, `Object.fromEntries`) lose their
  literal keys and yield nothing to extract.
- Machines carry no notion of an initial state, so no diagram marks one.
- `forwardEvents` spreads surface as self-loops on the outer state; drawing the
  inner machine as a subgraph needs the AST of the spread call.
- Mermaid edge labels fold object payload types to `{…}` and shorten long ones;
  the full type is in the table under each diagram.

See `specs/diagram-generation-feasibility.md` for the design and planned scope.
