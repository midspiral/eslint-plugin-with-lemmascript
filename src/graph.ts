// ───────────────────────────────────────────────────────────────────────────
// UNTRUSTED import-graph extraction — the trust boundary (see DESIGN.md §5).
//
// This is the shell, not the proof. It crawls a project, reads each module's
// static import specifiers (via the TypeScript parser — no regex), and resolves
// them to canonical module ids. Its RECALL is the named assumption: a missed
// edge (exotic dynamic `import(expr)`, unusual aliases) is a false negative.
// The verified core (`canReach`/`reachesAny`/`violates`) is EXACT over the
// graph this returns — completeness is relative to it.
// ───────────────────────────────────────────────────────────────────────────
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, dirname, resolve, extname } from 'node:path';
import * as ts from 'typescript';

export type Edge = { source: string; target: string };
export type Graph = { edges: Edge[]; modules: string[] };

const EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];

function walk(dir: string, acc: string[]): void {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (EXTS.includes(extname(p))) acc.push(p);
  }
}

// Static import / re-export / dynamic-import / require string specifiers, via
// the real TS parser (robust against comments, strings, multiline imports).
function specifiers(code: string, fileName: string): string[] {
  const sf = ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out = new Set<string>();
  const visit = (node: ts.Node): void => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      out.add(node.moduleSpecifier.text);
    } else if (ts.isCallExpression(node)) {
      const isImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === 'require';
      const arg = node.arguments[0];
      if ((isImport || isRequire) && arg && ts.isStringLiteral(arg)) out.add(arg.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return [...out];
}

// Resolve a RELATIVE specifier against the importing file. Bare (package)
// specifiers return null — we stop at the node_modules boundary, which is sound
// for first-party targets (a package can't import your DB module).
function resolveSpec(fromFile: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null;
  const base = resolve(dirname(fromFile), spec);
  const cands = [base, ...EXTS.map((e) => base + e), ...EXTS.map((e) => join(base, 'index' + e))];
  for (const c of cands) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}

function idOf(root: string, abs: string): string {
  return relative(root, abs).split('\\').join('/');
}

// Build the whole import graph under `rootDir` once. Module ids are paths
// relative to the root (e.g. `ui/Button.ts`).
export function buildGraph(rootDir: string): Graph {
  const root = resolve(rootDir);
  const files: string[] = [];
  walk(root, files);
  const modules = files.map((f) => idOf(root, f)).sort();
  const edges: Edge[] = [];
  for (const f of files) {
    const src = idOf(root, f);
    for (const spec of specifiers(readFileSync(f, 'utf8'), f)) {
      const tgt = resolveSpec(f, spec);
      if (tgt) edges.push({ source: src, target: idOf(root, tgt) });
    }
  }
  return { edges, modules };
}

// Modules whose id falls in a zone — a leading path glob (`ui`, `src/ui`, with
// an optional trailing `/**` or `/`). Plain segment-prefix match, no regex.
export function modulesInZone(modules: string[], zone: string): string[] {
  let prefix = zone;
  if (prefix.endsWith('/**')) prefix = prefix.slice(0, -3);
  if (prefix.endsWith('/')) prefix = prefix.slice(0, -1);
  return modules.filter((m) => m === prefix || m.startsWith(prefix + '/'));
}

// What the one-hop incumbents decide: a DIRECT source→sink import edge.
export function directViolation(edges: Edge[], sources: string[], sinks: string[]): boolean {
  const S = new Set(sources);
  const T = new Set(sinks);
  return edges.some((e) => S.has(e.source) && T.has(e.target));
}

// DISPLAY-ONLY shortest laundering chain, for the lint message (UNVERIFIED —
// the verified witness `findReachPath` is Stage 2). Multi-source BFS recording
// predecessors; the first sink reached gives a shortest source→sink chain.
export function shortestChain(edges: Edge[], sources: string[], sinks: string[]): string[] | null {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    const a = adj.get(e.source);
    if (a) a.push(e.target);
    else adj.set(e.source, [e.target]);
  }
  const sinkSet = new Set(sinks);
  const prev = new Map<string, string | null>();
  const queue: string[] = [];
  for (const s of sources) {
    if (!prev.has(s)) {
      prev.set(s, null);
      queue.push(s);
    }
  }
  while (queue.length > 0) {
    const cur = queue.shift() as string;
    if (sinkSet.has(cur)) {
      const path: string[] = [];
      let n: string | null = cur;
      while (n != null) {
        path.unshift(n);
        n = prev.get(n) ?? null;
      }
      return path;
    }
    for (const nx of adj.get(cur) ?? []) {
      if (!prev.has(nx)) {
        prev.set(nx, cur);
        queue.push(nx);
      }
    }
  }
  return null;
}
