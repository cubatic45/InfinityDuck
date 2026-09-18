#!/usr/bin/env bash
set -euo pipefail
repo_dir=$(pwd)
cd sdk
# Use the stable release feed definitions shipped with this SDK, via GitHub.
sed -i \
  -e 's#https://git.openwrt.org/feed/packages.git#https://github.com/openwrt/packages.git#' \
  -e 's#https://git.openwrt.org/project/luci.git#https://github.com/openwrt/luci.git#' \
  -e 's#https://git.openwrt.org/feed/routing.git#https://github.com/openwrt/routing.git#' \
  -e 's#https://git.openwrt.org/feed/telephony.git#https://github.com/openwrt/telephony.git#' feeds.conf.default
./scripts/feeds update -a
./scripts/feeds install -a
# Copy the checkout tested by Actions; never clone the package default branch.
cp -a "$repo_dir/duck" package/duck
cp -a "$repo_dir/luci-app-duck" package/luci-app-duck
cat > .config <<'CONFIG'
CONFIG_TARGET_x86=y
CONFIG_TARGET_x86_64=y
CONFIG_TARGET_x86_64_DEVICE_generic=y
CONFIG_DEVEL=y
CONFIG_USE_APK=y
# CONFIG_ALL is not set
# CONFIG_ALL_KMODS is not set
# CONFIG_ALL_NONSHARED is not set
CONFIG_BPF_TOOLCHAIN_HOST=y
CONFIG_USE_LLVM_HOST=y
CONFIG_PACKAGE_duck=m
CONFIG_PACKAGE_duck-geoip=m
CONFIG_PACKAGE_duck-geosite=m
CONFIG_PACKAGE_luci-app-duck=m
CONFIG_LUCI_LANG_zh_Hans=y
CONFIG_PACKAGE_luci-i18n-duck-zh-cn=m
CONFIG
make defconfig
for option in USE_APK PACKAGE_duck PACKAGE_duck-geoip PACKAGE_duck-geosite PACKAGE_luci-app-duck PACKAGE_luci-i18n-duck-zh-cn; do
  grep -Eq "^CONFIG_${option}=[ym]$" .config || { echo "Missing build selection: $option"; exit 1; }
done
cp .config "$repo_dir/artifacts/sdk.config"
cp feeds.conf.default "$repo_dir/artifacts/feeds.conf"
for feed in feeds/*/.git; do
  printf '%s %s\n' "$(dirname "$feed")" "$(git -C "$(dirname "$feed")" rev-parse HEAD)"
done >> "$repo_dir/artifacts/build-info.txt"
