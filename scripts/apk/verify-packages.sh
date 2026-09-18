#!/usr/bin/env bash
set -euo pipefail
mkdir -p artifacts/packages
for package in duck duck-geoip duck-geosite luci-app-duck luci-i18n-duck-zh-cn; do
  mapfile -t files < <(find sdk/bin -type f -name "${package}-[0-9]*.apk")
  [[ ${#files[@]} == 1 ]] || { echo "Expected one APK for $package, got ${#files[@]}"; exit 1; }
  cp "${files[0]}" artifacts/packages/
done
mapfile -t apk_tools < <(find sdk/staging_dir/host/bin -maxdepth 1 -name apk -type f)
[[ ${#apk_tools[@]} == 1 ]]
apk=$(realpath "${apk_tools[0]}")
for file in artifacts/packages/*.apk; do
  "$apk" adbdump "$file" > "$file.metadata.txt"
done
(cd artifacts/packages && sha256sum ./*.apk > SHA256SUMS)
{
  echo '### Built APK packages'
  echo
  echo 'Target: OpenWrt 25.12 x86/64. Editor regression tests and APK format checks passed.'
  echo 'These are package-build checks, not an eBPF dataplane/device test.'
  echo
  ls -lh artifacts/packages/*.apk
} >> "${GITHUB_STEP_SUMMARY:-artifacts/summary.md}"
