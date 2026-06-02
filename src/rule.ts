// The ESLint rule shell — untrusted glue. It assembles the import graph (once
// per scan-root, cached for the run) and asks the VERIFIED core whether the
// file being linted reaches a forbidden sink through ANY chain. The reachability
// decision is `reachesAny`, proved sound + complete in core.verified.ts; the
// rule contributes only extraction, options, and reporting.
import { ESLintUtils } from '@typescript-eslint/utils';
import { resolve, relative } from 'node:path';
import { buildGraph, modulesInZone, type Graph } from './graph';
import { findReachPath } from './core.verified';

type Constraint = { from: string; to: string };
type Options = [{ root?: string; constraints: Constraint[] }];
type MessageIds = 'forbiddenReach';

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/lemmascript/eslint-plugin-lemmascript#${name}`
);

// One global import graph per scan-root, shared across files in the lint run.
const graphCache = new Map<string, Graph>();
function graphFor(root: string): Graph {
  let g = graphCache.get(root);
  if (!g) {
    g = buildGraph(root);
    graphCache.set(root, g);
  }
  return g;
}

export const noForbiddenReach = createRule<Options, MessageIds>({
  name: 'no-forbidden-reach',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Forbid a module from reaching another through ANY import chain (transitively), not just by a direct import.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          root: { type: 'string' },
          constraints: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                from: { type: 'string' },
                to: { type: 'string' },
              },
              required: ['from', 'to'],
              additionalProperties: false,
            },
          },
        },
        required: ['constraints'],
        additionalProperties: false,
      },
    ],
    messages: {
      forbiddenReach:
        "'{{from}}' must not reach '{{to}}' — laundered through: {{chain}}",
    },
  },
  defaultOptions: [{ constraints: [] }],
  create(context, [options]) {
    const root = resolve(context.cwd, options.root ?? '.');
    return {
      Program(node): void {
        const selfId = relative(root, context.filename).split('\\').join('/');
        const graph = graphFor(root);
        for (const c of options.constraints) {
          const sources = modulesInZone(graph.modules, c.from);
          if (!sources.includes(selfId)) continue; // only report on a source-zone file
          const sinks = modulesInZone(graph.modules, c.to);
          // ── verified construction: a witness chain, or [] if no forbidden reach ──
          // findReachPath is proven sound + complete, so a non-empty result both
          // decides the violation AND is a genuine import path to a sink.
          const chain = findReachPath(graph.edges, selfId, sinks);
          if (chain.length > 0) {
            context.report({
              node,
              messageId: 'forbiddenReach',
              data: { from: c.from, to: c.to, chain: chain.join(' → ') },
            });
          }
        }
      },
    };
  },
});

export default noForbiddenReach;
