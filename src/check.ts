// CLI demo — runs the VERIFIED core over a real extracted import graph and puts
// the one-hop check (what every incumbent decides) next to the transitive reach
// check (what we prove). Run:  npx tsx src/check.ts [scanRoot]
import { buildGraph, modulesInZone, directViolation } from './graph';
import { violates, findReachPath } from './core.verified';

const root = process.argv[2] ?? 'examples/layered/src';
const { edges, modules } = buildGraph(root);
const ui = modulesInZone(modules, 'ui');
const db = modulesInZone(modules, 'db');

console.log('\neslint-plugin-lemmascript — no-forbidden-reach');
console.log(`project: ${root}  (${modules.length} modules, ${edges.length} import edges)`);
console.log('constraint: ui/** must not reach db/**\n');

const direct = directViolation(edges, ui, db); // what one-hop linters decide
const reach = violates(edges, ui, db); // the VERIFIED transitive decision

console.log(`  one-hop check (import/no-restricted-paths style) : ${direct ? 'VIOLATION' : 'pass  ← misses it'}`);
console.log(`  reach check   (verified no-forbidden-reach)       : ${reach ? 'VIOLATION  ← caught' : 'pass'}`);

if (reach) {
  let chain: string[] = [];
  for (const s of ui) {
    chain = findReachPath(edges, s, db); // verified: sound + complete witness
    if (chain.length > 0) break;
  }
  console.log('\n  laundered import chain (verified witness):');
  console.log(`    ${chain.length > 0 ? chain.join('  →  ') : '(none)'}`);
}
console.log('');
process.exit(reach ? 1 : 0);
