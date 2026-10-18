// Shared ESLint flat config for the monorepo (TypeScript strict, no `any`).
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/node_modules/**', '**/.next/**', '**/dist/**', '**/coverage/**', '**/src/generated/**', '**/.venv/**', 'playwright-report/**', 'test-results/**', '**/next-env.d.ts'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': ['warn', { fixStyle: 'inline-type-imports', disallowTypeAnnotations: false }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'smart'],
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}', 'apps/console/**/*.{ts,tsx}', 'packages/ui/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: { 'react-hooks/rules-of-hooks': 'error', 'react-hooks/exhaustive-deps': 'warn' },
  },
  {
    files: ['**/scripts/**', '**/*.mjs', 'packages/db/prisma/seed.ts'],
    rules: { 'no-console': 'off' },
  },
);
