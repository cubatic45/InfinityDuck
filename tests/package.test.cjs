const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('OpenWrt package carries the honk CodeMirror dae editor', () => {
  const makefile = fs.readFileSync('luci-app-duck/Makefile', 'utf8');
  const editor = fs.readFileSync('luci-app-duck/htdocs/luci-static/resources/duck-editor/lib/codemirror.js', 'utf8');
  const mode = fs.readFileSync('luci-app-duck/htdocs/luci-static/resources/duck-editor/mode/dae/dae.js', 'utf8');
  assert.match(makefile, /^PKG_VERSION:=1\.5\.0$/m);
  assert.match(makefile, /^LUCI_MINIFY_JS:=0$/m);
  assert.match(makefile, /^LUCI_MINIFY_CSS:=0$/m);
  assert.match(editor, /CodeMirror\.version = "5\.65\.21"/);
  assert.match(mode, /CodeMirror\.defineMode\("dae"/);
});
