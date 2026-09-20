const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('OpenWrt packaging preserves the prebuilt Monaco assets', () => {
  const makefile = fs.readFileSync('luci-app-duck/Makefile', 'utf8');
  assert.match(makefile, /^LUCI_MINIFY_JS:=0$/m);
  assert.match(makefile, /^LUCI_MINIFY_CSS:=0$/m);
});
