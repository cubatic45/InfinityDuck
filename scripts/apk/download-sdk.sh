#!/usr/bin/env bash
set -euo pipefail
: "${OPENWRT_VERSION:=25.12.5}"
[[ "$OPENWRT_VERSION" =~ ^25\.12\.[0-9]+$ ]] || { echo 'Expected an OpenWrt 25.12 release'; exit 1; }
base="https://downloads.openwrt.org/releases/$OPENWRT_VERSION/targets/x86/64"
mkdir -p artifacts
curl --fail --location --retry 3 "$base/sha256sums" -o artifacts/sdk-sha256sums
sdk_entry=$(awk '$2 ~ /\*?openwrt-sdk-.*-x86-64_.*Linux-x86_64\.tar\.zst$/ {print}' artifacts/sdk-sha256sums)
[[ $(printf '%s\n' "$sdk_entry" | wc -l) == 1 && -n "$sdk_entry" ]]
sdk_file=$(awk '{sub(/^\*/, "", $2); print $2}' <<< "$sdk_entry")
curl --fail --location --retry 3 "$base/$sdk_file" -o "$sdk_file"
printf '%s\n' "$sdk_entry" | sha256sum -c -
mkdir sdk
tar --zstd -xf "$sdk_file" -C sdk --strip-components=1
rm "$sdk_file"
{
  printf 'source_commit=%s\n' "$(git rev-parse HEAD)"
  printf 'source_ref=%s\n' "${GITHUB_REF:-$(git branch --show-current)}"
  printf 'openwrt_version=%s\nSDK=%s/%s\n' "$OPENWRT_VERSION" "$base" "$sdk_file"
  printf 'sdk_checksum=%s\n' "$sdk_entry"
  clang --version | head -1
  llvm-strip --version | head -1
} > artifacts/build-info.txt
