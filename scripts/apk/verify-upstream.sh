#!/usr/bin/env bash
set -euo pipefail

makefile=duck/Makefile
version=$(sed -n 's/^DAE_VERSION:=//p' "$makefile")
release_date=$(sed -n 's/^DAE_RELEASE_DATE:=//p' "$makefile")
hash=$(sed -n 's/^PKG_HASH:=//p' "$makefile")
source_url=https://github.com/daeuniverse/dae/releases/download/v${version}

[[ $version =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]
[[ $release_date =~ ^[0-9]{4}\.[0-9]{2}\.[0-9]{2}$ ]]
[[ $hash =~ ^[0-9a-f]{64}$ ]]
grep -qx 'PKG_VERSION:=$(DAE_RELEASE_DATE)' "$makefile"
grep -qx 'PKG_SOURCE_URL:=https://github.com/daeuniverse/dae/releases/download/v$(DAE_VERSION)' "$makefile"

upstream_hash=$(curl --fail --location --retry 3 \
  "$source_url/dae-full-src.tar.xz.dgst" |
  awk '$2 == "dae-full-src.tar.xz" && $3 == "sha256" { print $1 }')

[[ $upstream_hash == "$hash" ]] || {
  echo "Official dae v$version checksum mismatch" >&2
  exit 1
}

echo "version=$version" >> "${GITHUB_OUTPUT:-/dev/null}"
echo "Verified official dae v$version full-source release: $hash"
