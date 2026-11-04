const eslint = require('@eslint/js');
const tseslint = require('typescript-eslint');
const pluginVue = require('eslint-plugin-vue');
const eslintConfigPrettier = require('eslint-config-prettier');
const globals = require('globals');

module.exports = tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/src/generated/**',
      'package-lock.json',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
        extraFileExtensions: ['.vue'],
      },
    },
  },
  {
    files: ['**/*.{js,cjs,mjs,ts,vue}'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['**/*.cjs'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    files: ['**/*.{spec,e2e-spec}.ts', '**/test/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.jest,
      },
    },
  },
  eslintConfigPrettier,
);
