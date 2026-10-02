#!/usr/bin/env bash
set -euo pipefail
umask 022

# Match OpenWrt 25.12 include/download.mk's rawgit archive format,
# including pinned submodules and .gitattributes export rules.
version=${1:?package version required}
commit=${2:?source commit required}
[[ $version =~ ^[0-9]{4}\.[0-9]{2}\.[0-9]{2}$ ]]
[[ $commit =~ ^[0-9a-f]{40}$ ]]
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
subdir=duck-${version}
git clone --quiet --no-checkout https://github.com/olicesx/dae.git "$work/$subdir"
git -C "$work/$subdir" checkout --quiet --detach "$commit"
timestamp=$(git -C "$work/$subdir" log -1 --no-show-signature --format=@%ct)
git -C "$work/$subdir" config core.abbrev 8
git -C "$work/$subdir" archive --format=tar HEAD --output="$work/source.tar"
tar --numeric-owner --owner=0 --group=0 --ignore-failed-read \
  -C "$work/$subdir" -rf "$work/source.tar" .git .gitmodules 2>/dev/null
rm -rf "$work/$subdir"
mkdir "$work/$subdir"
# GNU tar preserves archive modes for root by default. Apply the SDK user's
# umask explicitly so local root runs and unprivileged CI runs agree.
tar --no-same-permissions -C "$work/$subdir" -xf "$work/source.tar"
git -C "$work/$subdir" submodule update --init --recursive >&2
rm -rf "$work/$subdir/.git" "$work/$subdir/.gitmodules"
tar --numeric-owner --owner=0 --group=0 --mode=a-s --sort=name \
  --mtime="$timestamp" -C "$work" -c "$subdir" | \
  gzip -nc > "$work/source.tar.gz"
if [[ -n ${KDAE_SOURCE_ARCHIVE:-} ]]; then
  mkdir -p "$(dirname "$KDAE_SOURCE_ARCHIVE")"
  cp "$work/source.tar.gz" "$KDAE_SOURCE_ARCHIVE"
fi
sha256sum "$work/source.tar.gz" | cut -d ' ' -f 1
