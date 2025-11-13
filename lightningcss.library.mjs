/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import {bundle} from 'lightningcss';
import fs from 'node:fs';
import path from 'node:path';

class AssetToDataUrlConverter {
  static #assetRegex = /\.(svg|png|jpe?g|gif|webp)$/i;
  static #mimeByExtension = {
    '.gif': 'image/gif',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
  };
  /**
   * NOTE: Resolve relative asset paths
   * @param {string} assetPath - The path to the asset
   * @param {string} importerPath - The path to the importer
   * @returns {string} The resolved asset path
   */
  static resolveAssetPath(assetPath, importerPath) {
    if (!AssetToDataUrlConverter.#assetRegex.test(assetPath)) {
      throw new Error(`Asset "${assetPath}" is not a supported file type`);
    }
    const resolvedAssetPath = importerPath
      ? path.resolve(path.dirname(importerPath), assetPath)
      : path.resolve(process.cwd(), assetPath);

    return resolvedAssetPath;
  }
  /**
   * NOTE: Convert CSS url(...) references to inline data URLs
   * @param {string} assetPath - The path to the asset
   * @param {string} importerPath - The path to the importer
   * @returns {string} The data URL
   */
  static constructDataUrl(assetPath, importerPath) {
    const absoluteAssetPath = AssetToDataUrlConverter.resolveAssetPath(
      assetPath,
      importerPath,
    );

    if (!fs.existsSync(absoluteAssetPath)) {
      throw new Error(`Asset file "${absoluteAssetPath}" does not exist`);
    }

    const extension = path.extname(absoluteAssetPath).toLowerCase();
    const mime =
      AssetToDataUrlConverter.#mimeByExtension[extension] ??
      'application/octet-stream';
    const base64 = fs.readFileSync(absoluteAssetPath).toString('base64');

    return `data:${mime};base64,${base64}`;
  }
}

const {code, dependencies} = bundle({
  analyzeDependencies: true,
  filename: 'src/library/main.css',
});

const css = dependencies.reduce(
  (cssWithPlaceholders, {type, url, placeholder, loc: {filePath}}) => {
    const stubbedAssetCode = AssetToDataUrlConverter.constructDataUrl(
      url,
      filePath,
    );

    return cssWithPlaceholders.replace(placeholder, stubbedAssetCode);
  },
  code.toString('utf8'),
);

await fs.writeFile('dist/library/main.css', css, (error) => {
  if (error) {
    console.error(error);
  }
});
