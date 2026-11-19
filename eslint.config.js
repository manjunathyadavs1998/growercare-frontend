import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**', 'e2e/playwright-report/**', 'e2e/test-results/**', 'packages/api-client/src/generated/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // SPEC-FE-01 §5: no raw HTML injection
      'no-restricted-syntax': ['error', { selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']", message: 'No raw HTML (XSS).' }],
    },
  },
  { files: ['scripts/**/*.mjs'], languageOptions: { globals: { ...globals.node } } },
  // SPEC-FE-04: the Playwright journeys run in Node (and evaluate some code in the page)
  { files: ['e2e/**/*.ts'], languageOptions: { globals: { ...globals.node, ...globals.browser } } },
);
