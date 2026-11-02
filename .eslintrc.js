/**
 * ESLint configuration.
 *
 * Status: NOT recovered from the runtime snapshot. The snapshot ships no
 * linting config, but `package.json` (which is verbatim from the snapshot)
 * defines a `lint` script that expects one, so a configuration existed in the
 * original tree and was not part of the deployed artefacts.
 *
 * This is the standard `@nestjs/schematics` v10 starting point, added only so
 * that `npm run lint` is runnable. Nothing here affects the build output.
 */
module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: 'tsconfig.json',
    tsconfigRootDir: __dirname,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint/eslint-plugin'],
  extends: [
    'plugin:@typescript-eslint/recommended',
    'plugin:prettier/recommended',
  ],
  root: true,
  env: {
    node: true,
    jest: true,
  },
  ignorePatterns: ['.eslintrc.js', 'legacy/**', 'dist/**'],
  rules: {
    '@typescript-eslint/interface-name-prefix': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-unused-vars': [
      'warn',
      { argsIgnorePattern: '^_' },
    ],

    // ── Deliberately off ────────────────────────────────────────────────
    // The source under src/ is kept emit-identical to the runtime snapshot
    // (see docs/RECONSTRUCTION.md). Enabling Prettier here would reformat
    // lines whose exact shape TypeScript's printer copies into dist/ — in one
    // case (`AnnouncementModule.imports`) reflowing the array genuinely
    // changes the emitted .js bytes. Formatting is left to the repo owner.
    'prettier/prettier': 'off',
    // BotProvider loads the Telegram client with CommonJS `require` because
    // the package ships no usable default export. That `require` is verbatim
    // from the compiled runtime output, so it is not negotiable.
    '@typescript-eslint/no-var-requires': 'off',
  },
};
