import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'
import unusedImports from 'eslint-plugin-unused-imports'
import importPlugin from 'eslint-plugin-import'

export default tseslint.config(
  // Ignore patterns
  {
    ignores: [
      'dist',
      'dist-react',
      'dist-electron',
      'node_modules',
      '*.config.js',
      '*.config.ts',
      'vite.config.*',
      'coverage',
      '. letta',
      '*.min.js',
      '*.min.css',
    ],
  },

  // Base configuration for all files
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx,js,jsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2021,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'unused-imports': unusedImports,
      'import': importPlugin,
    },
    rules: {
      // React hooks rules
      ...reactHooks.configs.recommended.rules,

      // React refresh
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],

      // TypeScript rules
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': 'off', // Handled by unused-imports
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-empty-interface': 'warn',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/prefer-nullish-coalescing': 'warn',
      '@typescript-eslint/prefer-optional-chain': 'warn',
      '@typescript-eslint/consistent-type-imports': [
        'warn',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],

      // Unused imports
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'warn',
        {
          vars: 'all',
          varsIgnorePattern: '^_',
          args: 'after-used',
          argsIgnorePattern: '^_',
        },
      ],

      // Import organization
      'import/order': [
        'warn',
        {
          groups: [
            'builtin',
            'external',
            'internal',
            ['parent', 'sibling', 'index'],
            'object',
            'type',
          ],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      'import/no-duplicates': 'error',
      'import/no-unresolved': 'off', // TypeScript handles this

      // General code quality
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
      'no-debugger': 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      'no-multiple-empty-lines': ['warn', { max: 2, maxEOF: 1 }],
      'no-trailing-spaces': 'warn',
      'eol-last': 'warn',
      'quotes': ['warn', 'single', { avoidEscape: true, allowTemplateLiterals: true }],
      'semi': ['error', 'always'],
      'comma-dangle': ['warn', 'always-multiline'],
      'object-shorthand': 'warn',
      'prefer-template': 'warn',
      'template-curly-spacing': 'warn',
      'eqeqeq': ['error', 'always', { null: 'ignore' }],
      'curly': ['warn', 'multi-line', 'consistent'],
      'no-throw-literal': 'error',
      'prefer-promise-reject-errors': 'error',
    },
    settings: {
      'import/resolver': {
        typescript: {
          alwaysTryTypes: true,
        },
      },
    },
  },

  // Electron-specific overrides
  {
    files: ['src/electron/**/*.{ts,js}'],
    rules: {
      'no-console': 'off', // Allow console in Electron main process
    },
  },

  // Prettier must be last to override other rules
  prettier,
)
