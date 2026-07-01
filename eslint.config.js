/**
 * Flat ESLint config for v9+.
 * Migrated from the implicit .eslintrc-style setup that broke after
 * the v9 release. Keep it minimal — strict TS rules + a small
 * housekeeping list.
 */

import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';

export default [
  {
    files: ['src/**/*.ts', 'test/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      // Project uses strict TS — noImplicitAny, etc. — so we don't
      // re-implement them at the lint layer. Just catch the cheap stuff.
      'no-unused-vars': 'off', // TS handles this
      '@typescript-eslint/no-unused-vars': 'off', // TS handles this
      'no-console': 'off', // CLI legitimately uses console.log for output
      'no-debugger': 'error',
      'eqeqeq': ['error', 'always'],
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
  {
    // Tests can be a little looser.
    files: ['test/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**'],
  },
];