const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('duck pins kdae with a verified git source archive', () => {
  const makefile = fs.readFileSync('duck/Makefile', 'utf8');
  const packageTest = fs.readFileSync('duck/test.sh', 'utf8');
  const version = makefile.match(/^PKG_VERSION:=(\d{4}\.\d{2}\.\d{2})$/m)?.[1];
  assert.ok(version);
  assert.match(makefile, /^PKG_SOURCE:=\$\(PKG_NAME\)-\$\(PKG_VERSION\)\.tar\.gz$/m);
  assert.match(makefile, /^PKG_SOURCE_PROTO:=git$/m);
  assert.match(makefile, /^PKG_SOURCE_URL:=https:\/\/github\.com\/olicesx\/dae\.git$/m);
  assert.match(makefile, /^PKG_SOURCE_VERSION:=[0-9a-f]{40}$/m);
  assert.match(makefile, /^PKG_MIRROR_HASH:=[0-9a-f]{64}$/m);
  assert.match(makefile, /\$\(call Build\/Prepare\/Default\)/);
  assert.match(makefile, /^DAE_GOEXPERIMENT:=newinliner,simd,heapminimum512kib,randomizedheapbase64$/m);
  assert.match(makefile, /GO_PKG_EXCLUDES:=[\s\S]*cmd\/dae-ebpf-audit[\s\S]*cmd\/generators[\s\S]*scripts\/semantic-refactor-quic-helper/);
  assert.match(makefile, /go generate \$\(PKG_BUILD_DIR\)\/common\/consts\/ebpf\.go/);
  assert.doesNotMatch(makefile, /dae-full-src|DAE_VERSION:=|PKG_HASH:=/);
  assert.equal(packageTest.match(/^expected_dae_version=(.*)$/m)?.[1], version);
});

test('automation tracks kdae and regenerates the archive checksum on updates', () => {
  const updater = fs.readFileSync('.github/workflows/dependabot.yml', 'utf8');
  const apk = fs.readFileSync('.github/workflows/apk.yml', 'utf8');
  const verify = fs.readFileSync('scripts/apk/verify-upstream.sh', 'utf8');
  assert.match(updater, /repos\/olicesx\/dae\/branches\/kdae/);
  assert.match(updater, /kdae-source-hash\.sh/);
  assert.match(updater, /s\/\^PKG_MIRROR_HASH:=/);
  assert.match(apk, /Verify pinned kdae source/);
  assert.match(apk, /openwrt-gh-action-sdk@[0-9a-f]{40} # go1\.26/);
  assert.match(verify, /upstream_hash == "\$hash"/);
  assert.doesNotMatch(updater, /repos\/daeuniverse\/dae\/releases/);
});
