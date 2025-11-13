/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

/**
 * @filename: lint-staged.config.js
 * @type {import('lint-staged').Configuration}
 */
export default {
  '*.{mjs,mts,js,ts,jsx,tsx,json,css}': ['prettier --write .'],
  '*.{mjs,mts,js,ts,jsx,tsx}': ['eslint ./'],
  '*.{mts,ts,tsx}': () => 'tsc --noEmit',
};
