//@ backend dafny

// ════════════════════════════════════════════════════════════════
// eslint-plugin-lemmascript — verified reachability core (Stage 0 spike)
//
// A directed import graph as a flat edge list. An edge {source, target}
// means module `source` imports module `target`, so reachability follows
// the import direction:  reach(a, b) ⟺ a transitively imports b.
//
//   canReach    decide reach(from, to) EXACTLY — sound + complete + terminating
//   reachesAny  does `from` reach ANY module in `sinks`?   (reach to a set)
//   violates    does ANY `sources` module reach ANY `sinks` module?
//               "UI must not reach DB"  ≡  !violates(edges, uiModules, dbModules)
//
// `reach` is the reflexive-transitive closure of the import relation — a
// path-witness ghost predicate defined in the hand-written .dfy proof
// (reused from the xyflow cycle-gate case study). The headline result —
// that this transitive check STRICTLY DOMINATES the one-hop check every
// incumbent linter uses — is the .dfy meta-theorem `Domination` +
// `Strictness`; it has no runtime function, it's a statement about the
// algorithms.
// ════════════════════════════════════════════════════════════════

interface Edge {
  source: string; // the importing module
  target: string; // the module it imports
}

// Reflexive reachability over the edge list: bounded BFS from `from`,
// terminating because `visited` grows monotonically toward the finite set
// of node ids. Decides reach(from, to) exactly.
export function canReach(edges: Edge[], from: string, to: string): boolean {
  //@ verify
  //@ ensures \result ==> reach(edges, from, to)
  //@ ensures reach(edges, from, to) ==> \result
  let frontier: string[] = [from];
  let visited: string[] = [];
  while (frontier.length > 0) {
    const cur = frontier[0];
    frontier = frontier.slice(1);
    if (cur === to) {
      return true;
    }
    if (!visited.includes(cur)) {
      visited = [...visited, cur];
      const succ = edges.filter((e) => e.source === cur).map((e) => e.target);
      frontier = [...frontier, ...succ];
    }
  }
  return false;
}

// Reach to a SET: does `from` reach any of the `sinks`? The forbidden
// targets of a constraint are a set, so the boundary query is set-reach.
export function reachesAny(edges: Edge[], from: string, sinks: string[]): boolean {
  //@ verify
  //@ ensures \result ==> exists(j, 0 <= j && j < sinks.length && reach(edges, from, sinks[j]))
  //@ ensures exists(j, 0 <= j && j < sinks.length && reach(edges, from, sinks[j])) ==> \result
  let i = 0;
  while (i < sinks.length) {
    if (canReach(edges, from, sinks[i])) {
      return true;
    }
    i = i + 1;
  }
  return false;
}

// Decide a forbidden-reach constraint: does ANY module in `sources` reach
// ANY module in `sinks`, through any import chain? This is the property the
// rule enforces — and the one one-hop linters decide only a weaker version of.
export function violates(edges: Edge[], sources: string[], sinks: string[]): boolean {
  //@ verify
  //@ ensures \result ==> exists(i, exists(j, 0 <= i && i < sources.length && 0 <= j && j < sinks.length && reach(edges, sources[i], sinks[j])))
  //@ ensures exists(i, exists(j, 0 <= i && i < sources.length && 0 <= j && j < sinks.length && reach(edges, sources[i], sinks[j]))) ==> \result
  let i = 0;
  while (i < sources.length) {
    if (reachesAny(edges, sources[i], sinks)) {
      return true;
    }
    i = i + 1;
  }
  return false;
}

// ── Witness validation (the certifying-algorithm half) ──────────────────────
// The untrusted shell searches the graph for a candidate laundering chain; this
// VERIFIED checker vouches for it before it is ever shown. So the chain printed
// in a lint error is proof-carrying: a real import path from `from` to a sink.

// Decide hasEdge exactly: is there a direct edge a → b?
export function edgeExists(edges: Edge[], a: string, b: string): boolean {
  //@ verify
  //@ ensures \result ==> hasEdge(edges, a, b)
  //@ ensures hasEdge(edges, a, b) ==> \result
  let i = 0;
  while (i < edges.length) {
    if (edges[i].source === a && edges[i].target === b) {
      return true;
    }
    i = i + 1;
  }
  return false;
}

// Validate a candidate chain: true ⟹ `chain` is a genuine import path that
// starts at `from`, ends at a forbidden sink, and steps along real edges.
export function checkChain(edges: Edge[], chain: string[], from: string, sinks: string[]): boolean {
  //@ verify
  //@ ensures \result ==> (chain.length >= 1 && chain[0] === from && isPath(edges, chain) && exists(j, 0 <= j && j < sinks.length && chain[chain.length - 1] === sinks[j]))
  if (chain.length === 0) {
    return false;
  }
  if (chain[0] !== from) {
    return false;
  }
  if (!sinks.includes(chain[chain.length - 1])) {
    return false;
  }
  let i = 0;
  while (i < chain.length - 1) {
    if (!edgeExists(edges, chain[i], chain[i + 1])) {
      return false;
    }
    i = i + 1;
  }
  return true;
}

// ── Verified witness CONSTRUCTION ───────────────────────────────────────────
// findReachPath PRODUCES the laundering chain in proven code: it returns a path
// [from, ..., sink] whenever `from` reaches a forbidden sink, and [] otherwise —
// sound AND complete. The path-BFS keeps whole paths in the frontier, so each is
// its own reachability witness; no unverified search is trusted.
export function findReachPath(edges: Edge[], from: string, sinks: string[]): string[] {
  //@ verify
  //@ ensures \result.length > 0 ==> (\result[0] === from && isPath(edges, \result) && exists(j, 0 <= j && j < sinks.length && \result[\result.length - 1] === sinks[j]))
  //@ ensures \result.length === 0 ==> !exists(j, 0 <= j && j < sinks.length && reach(edges, from, sinks[j]))
  let frontier: string[][] = [[from]];
  let visited: string[] = [];
  while (frontier.length > 0) {
    const p = frontier[0];
    frontier = frontier.slice(1);
    const cur = p[p.length - 1];
    if (sinks.includes(cur)) {
      return p;
    }
    if (!visited.includes(cur)) {
      visited = [...visited, cur];
      const extended = edges.filter((e) => e.source === cur).map((e) => [...p, e.target]);
      frontier = [...frontier, ...extended];
    }
  }
  return [];
}

// ════════════════════════════════════════════════════════════════
// The headline meta-theorems, surfaced. `reach`, `hasEdge`, `directViolation`,
// `reachViolation` are ghost/spec predicates DEFINED in core.verified.dfy (a
// path is not a runtime value); the `//@` clauses below REFERENCE them by name,
// and the proofs live in the matching `_ensures` lemmas in the .dfy.
// ════════════════════════════════════════════════════════════════

// DOMINATION — every direct (one-hop) violation is a real reach-violation. So the
// transitive check never misses what the cheap one-hop check every incumbent
// linter uses would catch: it dominates it.
export function domination(edges: Edge[], sources: string[], sinks: string[]): boolean {
  //@ verify
  //@ requires directViolation(edges, sources, sinks)
  //@ ensures reachViolation(edges, sources, sinks)
  return true;
}

// The laundering witness: ui → svc → db, with no direct ui → db edge.
export function strictnessEdges(): Edge[] {
  //@ verify
  return [{ source: "ui", target: "svc" }, { source: "svc", target: "db" }];
}

// STRICTNESS — on that witness, "ui must not reach db" IS violated transitively
// (ui → svc → db) yet there is NO direct violation. So the domination is STRICT:
// a real laundered path the one-hop check provably misses.
export function strictness(): boolean {
  //@ verify
  //@ ensures reachViolation(strictnessEdges(), ["ui"], ["db"]) && !directViolation(strictnessEdges(), ["ui"], ["db"])
  return true;
}
