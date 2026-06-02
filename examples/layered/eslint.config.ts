// Demo flat config: enforce "ui must not reach db" with the verified rule.
// Run from the project root:
//   npx eslint examples/layered/src --config examples/layered/eslint.config.ts
import tsParser from '@typescript-eslint/parser';
import lemmascript from '../../src/index';

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
