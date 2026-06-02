// eslint-plugin-lemmascript — a home for formally-verified ESLint rules.
// First rule: `lemmascript/no-forbidden-reach` (transitive import-boundary,
// reachability decision proved sound + complete in src/core.verified.ts).
import { noForbiddenReach } from './rule.js';

const plugin = {
  meta: { name: 'eslint-plugin-with-lemmascript', version: '0.1.0' },
  rules: {
    'no-forbidden-reach': noForbiddenReach,
  },
};

export default plugin;
