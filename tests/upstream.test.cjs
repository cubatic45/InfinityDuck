const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('duck uses an official dae full-source release', () => {
  const makefile = fs.readFileSync('duck/Makefile', 'utf8');
  const packageTest = fs.readFileSync('duck/test.sh', 'utf8');
  const version = makefile.match(/^DAE_VERSION:=(\d+\.\d+\.\d+)$/m)?.[1];

  assert.ok(version);
  assert.match(makefile, /^DAE_RELEASE_DATE:=\d{4}\.\d{2}\.\d{2}$/m);
  assert.match(makefile, /^PKG_VERSION:=\$\(DAE_RELEASE_DATE\)$/m);
  assert.match(makefile, /^PKG_SOURCE:=dae-full-src\.tar\.xz$/m);
  assert.match(
    makefile,
    /^PKG_SOURCE_URL:=https:\/\/github\.com\/daeuniverse\/dae\/releases\/download\/v\$\(DAE_VERSION\)$/m,
  );
  assert.match(makefile, /^PKG_HASH:=[0-9a-f]{64}$/m);
  assert.match(makefile, /^DAE_GOEXPERIMENT:=newinliner,simd,heapminimum512kib,randomizedheapbase64$/m);
  assert.doesNotMatch(makefile, /olicesx\/dae|PKG_SOURCE_VERSION/);
  assert.match(packageTest, new RegExp(`^expected_dae_version=${version}$`, 'm'));
});

test('automation tracks official stable dae releases', () => {
  const updater = fs.readFileSync('.github/workflows/dependabot.yml', 'utf8');
  const apk = fs.readFileSync('.github/workflows/apk.yml', 'utf8');

  assert.match(updater, /repos\/daeuniverse\/dae\/releases\/latest/);
  assert.match(updater, /dae-full-src\.tar\.xz\.dgst/);
  assert.doesNotMatch(updater, /olicesx\/dae|ref: ['"]?kdae/);
  assert.match(apk, /Verify official dae release/);
  assert.match(apk, /openwrt-gh-action-sdk@[0-9a-f]{40} # go1\.26/);
});
