# SPDX-License-Identifier: Apache-2.0
#
# Copyright (C) 2024 ImmortalWrt.org

include $(TOPDIR)/rules.mk

PKG_VERSION:=1.5.0
PKG_RELEASE:=1

# Keep the vendored, browser-tested editor bytes intact. LuCI's legacy
# minifiers otherwise rewrite every JavaScript and CSS resource while packing.
LUCI_MINIFY_JS:=0
LUCI_MINIFY_CSS:=0

PKG_LICENSE:=Apache-2.0
PKG_MAINTAINER:=JohnsonRan <me@ihtw.moe>

LUCI_TITLE:=Another LuCI app for dae
LUCI_DEPENDS:=+duck +duck-geoip +duck-geosite +jshn +flock

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
