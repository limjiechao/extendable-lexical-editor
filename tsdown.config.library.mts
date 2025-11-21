/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {defineConfig} from 'tsdown';

function convertAssetIntoDataUrl() {
  const assetRegex = /\.(svg|png|jpe?g|gif|webp)$/i;
  const mimeByExtension = {
    '.gif': 'image/gif',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
  };
  type SupportedExtension = keyof typeof mimeByExtension;
  function isSupportedExtension(
    extension: string,
  ): extension is SupportedExtension {
    return assetRegex.test(extension);
  }
  function assertIsSupportedExtension(
    extension: string,
  ): asserts extension is SupportedExtension {
    if (!isSupportedExtension(extension)) {
      throw new Error(`Asset "${extension}" is not a supported file type`);
    }
  }

  return {
    // Inline asset imports in JS/TS as data URLs
    load(assetPath: string) {
      const extension: string = path.extname(assetPath).toLowerCase();

      if (!isSupportedExtension(extension)) {
        return null;
      }

      const mime = mimeByExtension[extension] ?? 'application/octet-stream';
      const buffer = fs.readFileSync(assetPath);
      const base64 = buffer.toString('base64');

      return `export default "data:${mime};base64,${base64}";`;
    },
    name: 'assets-as-data-url',
    // NOTE:Resolve relative asset paths
    resolveId(assetPath: string, importerPath: string) {
      if (!assetRegex.test(assetPath)) {
        return null;
      }

      const resolved = importerPath
        ? path.resolve(path.dirname(importerPath), assetPath)
        : path.resolve(process.cwd(), assetPath);

      return resolved;
    },
    // NOTE: Rewrite CSS url(...) references to inline data URLs
    transform(code: string, assetPath: string) {
      if (!assetPath.endsWith('.css')) {
        return null;
      }

      // Match url(...) with or without quotes; ignore data:, http(s):, and absolute /
      const urlRe = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g;
      const replaced = code.replace(urlRe, (match, _q, urlPath) => {
        if (urlPath.startsWith('data:')) {
          return match;
        }

        if (urlPath.startsWith('http://') || urlPath.startsWith('https://')) {
          return match;
        }

        if (urlPath.startsWith('/')) {
          return match;
        }

        if (!assetRegex.test(urlPath)) {
          return match;
        }

        try {
          const absoluteAssetPath = path.resolve(
            path.dirname(assetPath),
            urlPath,
          );

          if (!fs.existsSync(absoluteAssetPath)) {
            return match;
          }

          const extension = path.extname(absoluteAssetPath).toLowerCase();

          assertIsSupportedExtension(extension);

          const mime = mimeByExtension[extension] ?? 'application/octet-stream';
          const base64 = fs.readFileSync(absoluteAssetPath).toString('base64');

          return `url("data:${mime};base64,${base64}")`;
        } catch {
          return match;
        }
      });

      if (replaced === code) {
        return null;
      }

      return {code: replaced, map: null};
    },
  };
}

export default defineConfig([
  {
    copy: [
      {
        from: './src/types/README.md',
        to: 'dist/types/README.md',
      },
      {
        from: './src/types/LexicalSchemaSample.lexical',
        to: 'dist/types/LexicalSchemaSample.lexical',
      },
    ],
    dts: {
      emitDtsOnly: true,
      /*
       * Inline all referenced type definitions into the output .d.ts file
       * To restrict inlining to just Lexical types:
       * ```
       * resolve: [/^lexical$/, /^@lexical\//],
       * ```
       */
      resolve: true,
      resolver: 'tsc',
    },
    entry: ['./src/types/LexicalSchema.ts'],
    outDir: 'dist/types',
    platform: 'neutral',
    plugins: [convertAssetIntoDataUrl()],
    tsconfig: './tsconfig.library.json',
  },
  {
    dts: true,
    entry: [
      './src/library/ExtendableEditor.tsx',
      './src/themes/PlaygroundEditorTheme.ts',
      './src/nodes/PlaygroundNodes.ts',
    ],
    external: ['react', 'react-dom', 'lexical', /^@lexical\//],
    outDir: 'dist',
    platform: 'neutral',
    plugins: [convertAssetIntoDataUrl()],
    tsconfig: './tsconfig.library.json',
  },
]);
