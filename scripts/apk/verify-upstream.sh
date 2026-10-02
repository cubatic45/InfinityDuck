#!/usr/bin/env bash
set -euo pipefail

makefile=duck/Makefile
version=$(sed -n 's/^PKG_VERSION:=//p' "$makefile")
commit=$(sed -n 's/^PKG_SOURCE_VERSION:=//p' "$makefile")
hash=$(sed -n 's/^PKG_MIRROR_HASH:=//p' "$makefile")

[[ $version =~ ^[0-9]{4}\.[0-9]{2}\.[0-9]{2}$ ]]
[[ $commit =~ ^[0-9a-f]{40}$ ]]
[[ $hash =~ ^[0-9a-f]{64}$ ]]
grep -qx 'PKG_SOURCE:=$(PKG_NAME)-$(PKG_VERSION).tar.gz' "$makefile"
grep -qx 'PKG_SOURCE_PROTO:=git' "$makefile"
grep -qx 'PKG_SOURCE_URL:=https://github.com/olicesx/dae.git' "$makefile"

upstream_hash=$(bash scripts/apk/kdae-source-hash.sh "$version" "$commit")
[[ $upstream_hash == "$hash" ]] || {
  echo "kdae source checksum mismatch: expected $hash, got $upstream_hash" >&2
  exit 1
}

echo "version=$version-${commit:0:8}" >> "${GITHUB_OUTPUT:-/dev/null}"
echo "Verified pinned kdae source $commit: $hash"
