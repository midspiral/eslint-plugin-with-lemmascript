# eslint-plugin-with-lemmascript

**Formally-verified ESLint rules.** Lint rules are heuristics you trust on faith. The rules
here are different: their core decision is a *machine-checked theorem*, proved in
[LemmaScript](https://lemmascript.com) — TypeScript verified through Dafny — and shipped as
the rule's actual runtime code.

First rule: **`no-forbidden-reach`** — architecture boundaries that can't be laundered.

## The problem

You want a rule like *"the UI must never depend on the DB layer."* Every existing boundary
linter — `import/no-restricted-paths`, `eslint-plugin-boundaries`, Nx module boundaries —
checks **direct** imports, one hop. So this slips right past all of them:

```
ui/Button.ts  →  services/format.ts  →  db/client.ts
   (imports a service…       …which imports the DB)
```

There is no direct `ui → db` import anywhere, so the one-hop linters stay green. But the UI
now *transitively* depends on the DB — and that erosion is exactly what you were trying to
prevent. `no-forbidden-reach` catches it through **any** chain, and prints the exact path:

```
ui/Button.ts  5:1  error  'ui' must not reach 'db' — laundered through:
                          ui/Button.ts → services/format.ts → db/client.ts
```

## What's proven

The rule's core is verified **sound and complete** — 30 proof obligations discharged by Dafny:

- **Verdict** — it flags a module **iff** a forbidden sink is reachable from it through some
  import chain. No depth cap, no missed paths (the failure mode of `import/no-cycle`'s
  `maxDepth`).
- **Witness** — the chain in the error message is itself a *verified* import path from the
  source to the sink, constructed by proven code (`findReachPath`) — not a heuristic guess.
- **It strictly dominates one-hop checking** — a machine-checked theorem (`Domination` +
  `Strictness`): every direct violation is caught, **and** there provably exist laundered
  violations that direct-edge checks miss.

The verified core is [`src/core.verified.ts`](src/core.verified.ts); the design and proof
walkthrough are in [`DESIGN.md`](DESIGN.md).

## Install

```sh
npm i -D eslint-plugin-with-lemmascript
```

## Use (flat config)

```js
import lemmascript from 'eslint-plugin-with-lemmascript';

export default [
  {
    plugins: { lemmascript },
    rules: {
      'lemmascript/no-forbidden-reach': ['error', {
        root: 'src',
        constraints: [
          { from: 'ui', to: 'db' }, // a UI module must not reach the DB layer, by any chain
        ],
      }],
    },
  },
];
```

Then run ESLint as you normally would:

```sh
npx eslint .
```

Any source module that can reach a forbidden zone — through *any* import chain — is reported,
with the offending chain in the message.

**Options**
- `root` — directory module ids are resolved against (default: the working directory).
- `constraints` — a list of `{ from, to }` zones (leading path-prefix globs, e.g. `ui`,
  `src/db`, `src/db/**`). A `from` module must not reach any `to` module through any import
  chain.

> Flat config only (ESLint 9+). The namespace is `lemmascript`; the rule id is
> `lemmascript/no-forbidden-reach`.

## Try the demo

The repo ships a sample layered project under `examples/layered/` with a seeded *laundered*
violation — `ui/Button.ts → services/format.ts → db/client.ts`, and no direct `ui → db`
import. From the repo root:

```sh
npm install
```

**Run the rule in real ESLint:**

```sh
npx eslint examples/layered/src --config examples/layered/eslint.config.ts
```

```
ui/App.ts     1:1  error  'ui' must not reach 'db' — laundered through: ui/App.ts → ui/Button.ts → services/format.ts → db/client.ts
ui/Button.ts  5:1  error  'ui' must not reach 'db' — laundered through: ui/Button.ts → services/format.ts → db/client.ts
✖ 2 problems (2 errors, 0 warnings)
```

**See the side-by-side** — the one-hop check passes while the verified reach check catches it:

```sh
npx tsx src/check.ts
```

```
  one-hop check (import/no-restricted-paths style) : pass  ← misses it
  reach check   (verified no-forbidden-reach)       : VIOLATION  ← caught

  laundered import chain (verified witness):
    ui/App.ts  →  ui/Button.ts  →  services/format.ts  →  db/client.ts
```

## What's verified, what's trusted

Stated plainly — the proof governs the algorithm, not the I/O:

- **Verified** (pure functions over the import graph, proved in LemmaScript → Dafny): the
  reachability decision *and* the witness chain — both sound and complete.
- **Trusted** (the untrusted shell): **import-graph extraction.** The plugin parses each
  module's imports with the TypeScript compiler and resolves them; a missed edge (exotic
  dynamic `import(expr)`, unusual path aliases) would be a false negative. Completeness is
  *relative to the extracted graph* — and that one trust assumption is named here, not
  papered over.

There is no "verified end-to-end" claim. What's proven is the part where the bugs hide:
the traversal is exact, so the whole trust surface shrinks to a single auditable question —
*is the graph faithful?* — instead of *faithful **and** is the search correct **and** did a
depth cap hide something?*

## Verify it yourself

```sh
npm run typecheck                  # the whole shell typechecks against the verified core
npm run verify                     # regenerate + Dafny-check core.verified.ts (needs Dafny + the LemmaScript toolchain)
```

## Status

A [LemmaScript](https://lemmascript.com) case study, working end-to-end and published on npm. Flat-config only; the policy
model is path-prefix zones (segment matching, no regex). Sharper extraction and more verified
rules welcome.
