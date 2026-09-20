// SPDX-License-Identifier: Apache-2.0
import { build } from 'esbuild';
import { mkdir, rm, copyFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const upstream = resolve(root, 'node_modules/monaco-editor');
const version = require('../../node_modules/monaco-editor/package.json').version;
const out = resolve(root, 'luci-app-duck/htdocs/luci-static/resources/monaco-editor');
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
const common = {
  bundle: true, minify: true, target: 'es2020', legalComments: 'eof',
  banner: { js: `/* Monaco Editor ${version}; Microsoft Corporation; MIT. See LICENSE and ThirdPartyNotices.txt. */` }
};
await build({ ...common, entryPoints: [resolve(root, 'scripts/editor/entry.mjs')],
  outfile: resolve(out, 'editor.js'), format: 'esm', loader: { '.ttf': 'file' },
  assetNames: 'assets/[name]-[hash]' });
await build({ ...common, entryPoints: [resolve(upstream, 'esm/vs/editor/editor.worker.js')],
  outfile: resolve(out, 'editor.worker.js'), format: 'iife' });
for (const lang of ['zh-cn', 'zh-tw'])
  await copyFile(resolve(upstream, `esm/vs/nls/lang/${lang}.js`), resolve(out, `${lang}.js`));
for (const file of ['LICENSE', 'ThirdPartyNotices.txt'])
  await copyFile(resolve(upstream, file), resolve(out, file));
await copyFile(resolve(root, 'node_modules/dompurify/LICENSE'), resolve(out, 'DOMPurify-LICENSE'));
await writeFile(resolve(out, 'VERSION'), version + '\n');
