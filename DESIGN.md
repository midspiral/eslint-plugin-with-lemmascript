# DESIGN — `lemmascript/no-forbidden-reach`

> **The first formally-verified ESLint rule.** It catches an architectural violation
> through *any* import chain — "UI must never reach the DB layer" — not just the
> one-hop import every existing rule checks. If it stays silent, there is provably no
> laundered path. The proof is what makes a green check mean what you think it means.

**Status:** _design._ Nothing built yet — this is the spec and staged plan.
**Category:** greenfield verified feature, distributed through a brownfield host's
**extension API** (an ESLint flat-config plugin) — no fork.

`eslint-plugin-lemmascript` is positioned as a *home* for verified lint rules, with
`no-forbidden-reach` as the first. The namespace advertises the selling point
(*verified*); the rule name carries the *what*.

---

## 1. Motivation — the gap is real

Every architecture-enforcement linter checks **direct** edges. We confirmed the
landscape:

- **`import/no-restricted-paths`** (eslint-plugin-import) and **`eslint-plugin-boundaries`**
  inspect only the import statements *in the file being linted* — one hop. They cannot
  see `ui/Button → services/format → db/client`.
- **`@nx/enforce-module-boundaries`** has a `banTransitiveDependencies` flag, but that's a
  *different concept* (don't import an npm package you only get transitively through
  `node_modules`) — not "module A reaches the DB layer through a chain of your own code."
- **`dependency-cruiser`** is the *only* incumbent that does true transitive reachability
  (`reachable: true` rules) — but it's a standalone CLI, the policy is regex/glob path
  strings, the feature carries documented limitations, and there is **no soundness story**:
  it's an unverified DFS.

So nobody does **sound, transitive, typed-policy forbidden-reach as an ESLint rule.** The
failure mode of every direct-edge checker is *silent*: the laundered violation passes, the
check is green, and the architecture has already eroded.

This is a clean greenfield-in-brownfield: we are **not** proving an existing rule (the
native rules' core is a trivial one-hop check; there's nothing to verify in place). We
write a new reachability decision procedure, prove it, and graft it onto ESLint through
the plugin API.

## 2. The one thing that must never break

> **No laundered escape (completeness).** If `no-forbidden-reach` stays silent, then in the
> import graph we built there is genuinely **no path, at any depth**, from a source module
> to a forbidden sink.

Completeness is the load-bearing half — it's the exact property the incumbents lack.
Soundness (we never flag a module that *can't* reach a sink) keeps it usable; completeness
is what makes a passing run *mean* something.

## 3. The verified core

Pure functions over a flat graph — no ESLint, no `fs`, no `Map`/`Set` in the proven
surface.

```ts
type ModuleId = string;
type Edge = { from: ModuleId; to: ModuleId };   // an import: `from` imports `to`
```

### 3.1 The key insight

A layering policy like "UI must not depend on DB" is a constraint on the **reachability**
relation, not the direct-edge relation. Enforcing it *correctly* therefore requires
deciding reachability. Direct-edge checking decides a **strictly weaker** property (is
there a one-hop `source → sink` edge?), so it has false negatives exactly when the
violation is laundered through an intermediate module. The whole feature reduces to a
correct reachability decision — plus a theorem that says *why* the cheap check is unsound.

### 3.2 `reach` — the spec-only predicate

`reach(edges, from, to)`: a path witness `n0 = from, …, nk = to` with
`hasEdge(edges, nᵢ, nᵢ₊₁)` for each step, `k ≥ 0` (reflexive). The reflexive-transitive
closure of the import relation. (Same shape proven in the xyflow case study — reused, not
reinvented.)

### 3.3 `canReach` — the proof-bearing search

```ts
//@ ensures \result ==> reach(edges, from, to)          // soundness
//@ ensures reach(edges, from, to) ==> \result          // completeness (the hard direction)
function canReach(edges: Edge[], from: ModuleId, to: ModuleId): boolean { /* BFS worklist */ }
```

Bounded BFS over a `visited` list, terminating because the unvisited universe strictly
shrinks. Loop invariants: every id in `visited` is reachable from `from` (soundness side);
on termination every reachable id is in `visited` (closure / fixpoint side). This is the
xyflow `canReach` pattern — completeness via a closure invariant → empty-frontier
contradiction.

### 3.4 `reachesAny` — reachability to a *set* (the new generalization)

The query isn't "can A reach a fixed B" — it's "can A reach **any** forbidden sink":

```ts
//@ ensures \result ==> exists(j, 0 <= j < |sinks| && reach(edges, from, sinks[j]))   // sound
//@ ensures exists(j, 0 <= j < |sinks| && reach(edges, from, sinks[j])) ==> \result   // complete
function reachesAny(edges: Edge[], from: ModuleId, sinks: ModuleId[]): boolean
```

### 3.5 `violates` — decide a constraint exactly

A constraint keeps the verified core **generic** (no domain enums baked in — the
vocabulary of "ui"/"db" lives in the shell): a constraint is just two module sets.

```ts
type Constraint = { sources: ModuleId[]; sinks: ModuleId[] };   // sources must not reach sinks

//@ ensures \result ==> exists(i, 0 <= i < |c.sources| && reachesAny(edges, c.sources[i], c.sinks))
//@ ensures (exists(i, ...)) ==> \result
function violates(edges: Edge[], c: Constraint): boolean
```

### 3.6 The headline theorem — we strictly dominate direct checking

This, not the reachability search, is the fresh content (and the slide that sells it):

- `directViolation(edges, c)` := `exists` edge `(a,b)` with `a ∈ sources`, `b ∈ sinks`
  (what one-hop linters find).
- **Theorem (domination):** `directViolation(edges, c) ==> violates(edges, c)` — every
  direct violation is real, so we never *miss* what they catch.
- **Theorem (strictness / counterexample):** there exist `edges, c` with
  `violates(edges, c) ∧ ¬directViolation(edges, c)` — exhibited by the 2-edge witness
  `a → x → b` (`a ∈ sources`, `b ∈ sinks`, `x` neither). The laundered path the cheap check
  provably misses.

Mirrors eventab's "naive `round` drops a cent": the cheap thing is *plausible and wrong*,
and the proof is the thing that shows it.

### 3.7 `findReachPath` — the witness, exported as UX

Completeness already constructs a path; surface it. The lint error names the *exact
laundering chain*, which is what makes the demo land:

```ts
//@ ensures |\result| > 0 ==> reach-path(edges, \result) && \result[0] == from && member(\result[last], sinks)
function findReachPath(edges: Edge[], from: ModuleId, sinks: ModuleId[]): ModuleId[]
```

> `ui/Button.ts → services/format.ts → db/client.ts`

(xyflow exported a topological-rank witness from its invariant; this is the analogous
usable artifact — the path falls straight out of the completeness proof.)

## 4. Theorems (planned)

1. **Search correctness** — `canReach` decides `reach` exactly: sound, complete, terminating.
   The reused meat; completeness is the one genuinely hard proof.
2. **Set reachability** — `reachesAny` decides `∃ sink reachable` exactly.
3. **Constraint decision** — `violates` decides `∃ source that reachesAny sinks` exactly.
4. **Domination** — `directViolation ⇒ violates` (we catch everything one-hop catches).
5. **Strictness** — a witness where `violates ∧ ¬directViolation` (the laundered miss). 4+5
   are the "why this rule exists" pair.
6. **Path witness** — `findReachPath` returns a valid path from a source to a sink whenever
   one exists; empty iff `¬violates`.

## 5. Trust boundary — verified vs. trusted

State it plainly; the demo must not imply more than is proven.

**Verified** (pure functions over `Edge[]` / `ModuleId`): `canReach`, `reachesAny`,
`violates`, `findReachPath` — sound + complete + terminating; the domination/strictness
theorems. No ESLint, no I/O.

**Trusted — the shell's obligations (the named assumptions):**
- **Graph faithfulness.** Every real import edge appears in the extracted graph. The known
  gaps — dynamic `import(expr)`, barrel re-exports, path aliases, type-only edges — can
  drop an edge and cause a *false negative*. This is the dominant trust assumption (the
  analogue of playground-express's `extern` sink contracts).
- **Completeness is relative to the built graph.** "No forbidden reach" means *none in the
  graph we assembled* — the proof governs the algorithm, not the extractor's recall.
- **Canonical module ids.** The resolver maps specifiers to canonical ids consistently
  (same file ⇒ same id), so edges and zone membership align.
- **Zone membership.** Which modules count as `sources` / `sinks` (from the config's path
  patterns) faithfully reflects intent.

The honest pitch is exactly this split: incumbents are weak on *both* axes (incomplete
graph **and** heuristic/depth-capped traversal). We make the traversal **provably exact**,
shrinking the whole trust surface to one auditable question — *is the graph faithful?* —
instead of *faithful AND is the DFS right AND did a depth cap hide something?*

## 6. Host integration — the ESLint graft

ESLint runs **per-file** and hands a rule no whole-program graph — which is *why* the
native incumbents are direct-only. `import/no-cycle` is the proof-of-concept that a rule
*can* crawl imports across files (it resolves and reads imported files, with a depth cap).
We reuse that crawl/resolver pattern to **assemble the global graph**, then hand it to the
verified core with no depth cap.

- Extraction strategy: build the import graph once per lint run and memoize it (crawl from
  each entry file, or accumulate at `Program` and decide at the end). Untrusted glue.
- The rule `lemmascript/no-forbidden-reach` reads constraints from rule options
  (`sources` / `sinks` as path patterns — **not** regex; segment/glob matching, per the
  no-regex-modeling constraint), looks up the graph, calls `violates`, and reports on the
  source module with `findReachPath` in the message.
- The verified core is a separate LemmaScript-verified `.ts` module the JS rule *imports*.
  The rule shell can only *call* the proven decision — it can't re-implement reachability
  (trusted core / thin shell, the eventab architecture).

Flat-config usage:
```js
import lemmascript from 'eslint-plugin-lemmascript';
export default [{
  plugins: { lemmascript },
  rules: {
    'lemmascript/no-forbidden-reach': ['error', {
      constraints: [{ sources: ['src/ui/**'], sinks: ['src/db/**'] }],
    }],
  },
}];
```
(Flat-config only — dropping the `eslint-plugin-` *string* resolution; the package keeps
the conventional name for discoverability. Noted in the README.)

## 7. Demo (run it — verify ≠ test)

A tiny layered sample project: `src/ui/`, `src/services/`, `src/db/`, constraint
"ui must not reach db", with a **laundered** violation seeded:
`src/ui/Button.ts → src/services/format.ts → src/db/client.ts` (no direct ui→db import
anywhere).

Side-by-side, run in a real terminal / CI and **observed**, not asserted:
- **`import/no-restricted-paths`** configured for the same boundary → **passes.** The silent
  miss, on screen.
- **`lemmascript/no-forbidden-reach`** → **flags** `src/ui/Button.ts`, printing the exact
  chain `ui/Button.ts → services/format.ts → db/client.ts`.

Incumbent green, ours red-with-the-path. That contrast *is* the spectacular result.

## 8. Architecture

```
  src/core.verified.ts   VERIFIED. canReach, reachesAny, violates, findReachPath.
       │                 Pure: Edge[] + ModuleId. No ESLint, no fs. Proven in LemmaScript → Dafny.
  src/graph.ts           glue: crawl + resolve imports → Edge[]; memoized per run. UNTRUSTED.
  src/rule.ts            the ESLint rule: options → constraints, calls violates, reports witness path.
  src/index.ts           plugin entry: { rules: { 'no-forbidden-reach': ... } }.
  examples/layered/      the demo project + side-by-side eslint configs.
```

## 9. Staged proof plan

Verified core first; the shell is glue that can only call it.

| Stage | Lands | Status |
|---|---|---|
| **0 — reachability core** | `reach` predicate; `canReach` (sound + complete + terminating); `reachesAny` | _planned_ |
| **1 — constraint + domination** | `violates` decides a constraint exactly; **domination + strictness** theorems (the "why") with the laundered-path counterexample | _planned_ |
| **2 — witness path** | `findReachPath` returns the offending chain; proven a valid source→sink path | _planned_ |
| **3 — ESLint plugin shell** | graph extraction (crawl/cache), `no-forbidden-reach` rule, options schema, report with chain | _planned_ |
| **4 — demo + side-by-side** | layered sample project; `import/no-restricted-paths` passes while we catch; run in CI, observed | _planned_ |
| **5 — order-respecting note (optional)** | prove direct checking *is* sound for a partial-order layering — scopes the tool honestly: forbidden-reach is for isolation/enclave policies, the case the order doesn't cover | _deferred_ |

**First action — the spike:** Stage 0 + the strictness witness from Stage 1. Show
LemmaScript proving `canReach` complete and exhibiting `violates ∧ ¬directViolation` on the
2-edge laundered path. If that proof is clean and *followable*, the spine holds and the
plugin builds around it.

## 10. Decisions

- **Generic core.** Constraints are pairs of module-id sets; "ui"/"db" vocabulary lives in
  the shell config, never in the proven code (verified-core-stays-generic).
- **Reuse, don't reinvent.** `canReach`/`reach` reuse the xyflow reachability machinery.
  The fresh content is the **domination/strictness** characterization and the
  per-file-linter graph-assembly trust boundary — not the search.
- **No regex in policy or core.** Path patterns are segment/glob membership, matched in the
  shell; the verified core sees only resolved id sets (no-regex-modeling).
- **Flat-config only.** Namespace `lemmascript` is decoupled from the package name; package
  keeps `eslint-plugin-` for discoverability.
- **Witness path is first-class.** It's the demo payload *and* it falls out of the
  completeness proof for free — surface it, don't recompute it.

## 11. What is *not* verified (trust boundary, restated)

- **The extracted graph's recall.** Dynamic `import()`, barrels, aliases, type-only edges —
  a missed edge is a false negative. Named, not proven; the dominant assumption.
- **Resolver / id canonicalization.** Trusted glue.
- **Zone membership** from path patterns — trusted config interpretation.
- **Runtime wiring.** Reachability is over static `import` edges; passing a `db` handle
  through a library via dependency injection is a data-flow escape no import-graph tool
  catches. Out of scope, stated.

No "verified end-to-end" claim. The trustworthy artifact is the **decision**: given the
graph, there is no laundered path — sound, complete, and dominating the cheap check that
silently misses.
