const js = require('@eslint/js');
const globals = require('globals');
module.exports = [
  { ignores: ['node_modules/**', 'dist/**', 'build/**'] },
  js.configs.recommended,
  { files: ['**/*.{js,cjs}'], languageOptions: { ecmaVersion: 'latest', sourceType: 'commonjs', globals: globals.node }, rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }], 'no-empty': ['error', { allowEmptyCatch: true }] } },
  { files: ['renderer/**/*.js'], languageOptions: { sourceType: 'module', globals: globals.browser } },
];
