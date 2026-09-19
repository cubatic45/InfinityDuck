#!/usr/bin/env bash
set -euo pipefail

package_dir=bin/packages/x86_64/infinityduck_ci
artifact_dir=artifacts/packages
required_packages=(duck duck-geoip duck-geosite luci-app-duck)

[[ -d $package_dir ]] || {
  echo "APK output directory does not exist: $package_dir" >&2
  exit 1
}

mkdir -p "$artifact_dir"

for package in "${required_packages[@]}"; do
  mapfile -t files < <(find "$package_dir" -maxdepth 1 -type f -name "${package}-[0-9]*.apk" -print)
  if [[ ${#files[@]} -ne 1 ]]; then
    echo "Expected one APK for $package, found ${#files[@]}" >&2
    find "$package_dir" -maxdepth 1 -type f -name '*.apk' -print >&2
    exit 1
  fi
  cp "${files[0]}" "$artifact_dir/"
done

# Keep generated translation APKs when the SDK enables LuCI languages.
find "$package_dir" -maxdepth 1 -type f -name 'luci-i18n-duck-*.apk' \
  -exec cp {} "$artifact_dir/" \;

(
  cd "$artifact_dir"
  sha256sum ./*.apk > SHA256SUMS
)

{
  echo '### OpenWrt APK build'
  echo
  echo 'Target: OpenWrt 25.12 x86/64.'
  echo 'Editor regression tests and package compilation passed.'
  echo 'This workflow does not exercise the eBPF dataplane on an OpenWrt device.'
  echo
  echo '```text'
  ls -lh "$artifact_dir"/*.apk
  echo '```'
} >> "${GITHUB_STEP_SUMMARY:-artifacts/summary.md}"
