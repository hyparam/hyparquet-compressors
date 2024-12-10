import javascript from '@eslint/js'
import jsdoc from 'eslint-plugin-jsdoc'

export default [
  {
    ignores: [
      'node_modules/**/*',
      'coverage/',
      'dist/',
    ],
  },
  {
    plugins: {
      jsdoc,
    },

    languageOptions: {
      globals: {
        'atob': false,
      },
    },

    rules: {
      ...javascript.configs.recommended.rules,
      'arrow-spacing': 'error',
      camelcase: 'off',
      'comma-spacing': 'error',
      'comma-dangle': ['error', {
        arrays: 'always-multiline',
        objects: 'always-multiline',
        imports: 'always-multiline',
        exports: 'always-multiline',
        functions: 'never',
      }],
      'eol-last': 'error',
      eqeqeq: 'error',
      'func-style': ['error', 'declaration'],
      indent: ['error', 2],
      'jsdoc/check-param-names': 'error',
      'jsdoc/check-property-names': 'error',
      'jsdoc/check-tag-names': 'error',
      'jsdoc/require-param': 'error',
      'jsdoc/require-param-type': 'error',
      'jsdoc/require-returns': 'error',
      'jsdoc/require-returns-type': 'error',
      'jsdoc/sort-tags': 'error',
      'no-constant-condition': 'off',
      'no-extra-parens': 'error',
      'no-multi-spaces': 'error',
      'no-trailing-spaces': 'warn',
      'no-undef': 'error',
      'no-unused-vars': 'error',
      'no-useless-concat': 'error',
      'no-useless-rename': 'error',
      'no-useless-return': 'error',
      'no-var': 'error',
      'object-curly-spacing': ['error', 'always'],
      'prefer-const': 'error',
      'prefer-promise-reject-errors': 'error',
      quotes: ['error', 'single'],
      'require-await': 'warn',
      semi: ['error', 'never'],
      'sort-imports': ['error', {
        ignoreDeclarationSort: true,
        ignoreMemberSort: false,
        memberSyntaxSortOrder: ['none', 'all', 'multiple', 'single'],
      }],
      'space-infix-ops': 'error',
    },
  },
]