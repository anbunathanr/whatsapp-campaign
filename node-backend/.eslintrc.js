module.exports = {
  env: {
    node: true,
    es2021: true,
  },
  extends: ['eslint:recommended', 'plugin:node/recommended', 'prettier'],
  plugins: ['node'],
  parserOptions: {
    ecmaVersion: 2021,
    sourceType: 'commonjs',
  },
  rules: {
    // Error prevention
    'no-console': 'warn',
    'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'no-process-exit': 'off',

    // Node.js specific
    'node/no-unsupported-features/es-syntax': 'off',
    'node/no-missing-require': 'error',
    'node/no-unpublished-require': 'off',

    // Code style
    'prefer-const': 'error',
    'no-var': 'error',
    eqeqeq: ['error', 'always'],
    curly: ['error', 'all'],
  },
  overrides: [
    {
      // Apply Jest environment only to test files
      files: ['**/*.test.js', '**/*.spec.js', '**/tests/**/*.js', '**/__tests__/**/*.js'],
      env: {
        jest: true,
      },
    },
  ],
};
