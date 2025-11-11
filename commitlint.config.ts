/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

const config = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-empty': [1, 'never'],
    'scope-enum': [
      2,
      'always',
      [
        // Dependency-related changes
        'deps',
        // ESLint-related changes
        'eslint',
        // Prettier-related changes
        'prettier',
        // TypeScript-related changes
        'typescript',
      ],
    ],
    'type-enum': [
      2,
      'always',
      [
        // Changes that affect the build system or dependency-only changes
        'build',
        // Changes to CI workflows
        'ci',
        // Documentation-only changes
        'docs',
        // A new feature
        'feat',
        //A bug fix
        'fix',
        // A code change that improves performance
        'perf',
        // A code change that neither fixes a bug nor adds a feature
        'refactor',
        // A commit that reverts a previous commit
        'revert',
        // Changes that do not affect the meaning of the code
        'style',
        // Adding missing tests or correcting existing tests
        'test',
        // Used for automated releases-only
        'release',
      ],
    ],
  },
};

export default config;
