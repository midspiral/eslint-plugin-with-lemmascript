// Loads the BUILT plugin from dist/ in plain Node ESM — the published-artifact smoke test.
//   npx eslint examples/layered/src --config examples/layered/eslint.config.dist.mjs
import tsParser from '@typescript-eslint/parser';
import lemmascript from '../../dist/index.js';

export default [
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: { parser: tsParser },
    plugins: { lemmascript },
    rules: {
      'lemmascript/no-forbidden-reach': [
        'error',
        {
          root: 'examples/layered/src',
          constraints: [{ from: 'ui', to: 'db' }],
        },
      ],
    },
  },
];
