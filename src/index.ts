// eslint-plugin-lemmascript — a home for formally-verified ESLint rules.
// First rule: `lemmascript/no-forbidden-reach` (transitive import-boundary,
// reachability decision proved sound + complete in src/core.verified.ts).
import { noForbiddenReach } from './rule';

const plugin = {
  meta: { name: 'eslint-plugin-lemmascript', version: '0.0.0' },
  rules: {
    'no-forbidden-reach': noForbiddenReach,
  },
};

export default plugin;
