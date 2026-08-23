# SPDX-License-Identifier: GPL-2.0-only
#
# Copyright (C) 2023 ImmortalWrt.org

include $(TOPDIR)/rules.mk

PKG_NAME:=duck
PKG_VERSION:=2026.08.23
PKG_RELEASE:=1

PKG_SOURCE_PROTO:=git
PKG_SOURCE_URL:=https://github.com/olicesx/dae.git
PKG_SOURCE_VERSION:=f1318b04dde70c7d3a3f5c41ef27d862884960cd
PKG_MIRROR_HASH:=skip

PKG_LICENSE:=AGPL-3.0-only
PKG_LICENSE_FILE:=LICENSE
PKG_MAINTAINER:=JohnsonRan <me@ihtw.moe>

PKG_BUILD_DEPENDS:=golang/host bpf-headers
PKG_BUILD_PARALLEL:=1
PKG_BUILD_FLAGS:=no-mips16

GO_PKG:=github.com/daeuniverse/dae
GO_PKG_EXCLUDES:=control/kern/tests
GO_PKG_LDFLAGS_X:= \
	$(GO_PKG)/cmd.Version=$(PKG_VERSION) \
	$(GO_PKG)/common/consts.MaxMatchSetLen_=1024
GO_PKG_TAGS:=trace

include $(INCLUDE_DIR)/package.mk
include $(INCLUDE_DIR)/bpf.mk
include $(TOPDIR)/feeds/packages/lang/golang/golang-package.mk

GEODATA_VER:=202605162239
GEO_PKG_VERSION:=2026.08.23
GEOIP_FILE:=geoip.dat.$(GEODATA_VER)
define Download/geoip
  URL:=https://github.com/Loyalsoldier/v2ray-rules-dat/releases/download/$(GEODATA_VER)/
  URL_FILE:=geoip.dat
  FILE:=$(GEOIP_FILE)
  HASH:=e5fb5bde7ad1377500fc780b3e02c3203916ccfd82cba854c1a7a13d58c462d3
endef

GEOSITE_FILE:=geosite.dat.$(GEODATA_VER)
define Download/geosite
  URL:=https://github.com/Loyalsoldier/v2ray-rules-dat/releases/download/$(GEODATA_VER)/
  URL_FILE:=geosite.dat
  FILE:=$(GEOSITE_FILE)
  HASH:=b054483a82f678440e90c2686e5280c5514ec8c9ae446e3c3ed3e17c82a54521
endef

UNZIP_CMD:=unzip -q -d $(PKG_BUILD_DIR) $(DL_DIR)/$(PKG_SOURCE)

define Package/duck/Default
  SECTION:=net
  CATEGORY:=Network
  SUBMENU:=Web Servers/Proxies
  URL:=https://github.com/olicesx/dae/tree/kdae
endef

define Package/duck
  $(call Package/duck/Default)
  TITLE:=A lightweight and high-performance transparent proxy solution
  # You need enable KERNEL_DEBUG_INFO_BTF and KERNEL_BPF_EVENTS
  DEPENDS:=$(GO_ARCH_DEPENDS) $(BPF_DEPENDS)  \
    +ca-bundle +kmod-sched-core +kmod-sched-bpf +kmod-xdp-sockets-diag \
    +kmod-veth
endef

define Package/duck-geoip
  $(call Package/duck/Default)
  TITLE:=geoip for duck
  DEPENDS:=+duck
  VERSION:=$(GEO_PKG_VERSION)-r$(PKG_RELEASE)
  PKGARCH:=all
endef

define Package/duck-geosite
  $(call Package/duck/Default)
  TITLE:=geosite for duck
  DEPENDS:=+duck
  VERSION:=$(GEO_PKG_VERSION)-r$(PKG_RELEASE)
  PKGARCH:=all
endef

define Package/duck/description
  dae, means goose, is a lightweight and high-performance transparent
  proxy solution.

  In order to improve the traffic diversion performance as much as possible,
  dae runs the transparent proxy and traffic diversion suite in the linux
  kernel by eBPF. Therefore, we have the opportunity to make the direct
  traffic bypass the forwarding by proxy application and achieve true direct
  traffic through. Under such a magic trick, there is almost no performance
  loss and additional resource consumption for direct traffic.
endef

define Package/duck/conffiles
/etc/duck/config.dae
/etc/config/duck
endef

duck_CFLAGS:= \
	-O2 -Wall -Werror \
	-DMAX_MATCH_SET_LEN=1024 \
	-I$(BPF_HEADERS_DIR)/tools/lib \
	-I$(BPF_HEADERS_DIR)/arch/$(BPF_KARCH)/include/asm/mach-generic

define Build/Prepare
	$(call Build/Prepare/Default)
ifneq ($(CONFIG_PACKAGE_duck-geoip),)
	$(call Download,geoip)
endif
ifneq ($(CONFIG_PACKAGE_duck-geosite),)
	$(call Download,geosite)
endif
endef

define Build/Compile
	( \
		export \
		$(GO_GENERAL_BUILD_CONFIG_VARS) \
		$(GO_PKG_BUILD_CONFIG_VARS) \
		$(GO_PKG_BUILD_VARS) \
		BPF_CLANG="$(CLANG)" \
		BPF_STRIP_FLAG="-strip=$(LLVM_STRIP)" \
		BPF_CFLAGS="$(duck_CFLAGS)" \
		BPF_TARGET="bpfel,bpfeb" \
		BPF_TRACE_TARGET="$(GO_ARCH)" ; \
		go generate $(PKG_BUILD_DIR)/control/control.go ; \
		go generate $(PKG_BUILD_DIR)/trace/trace.go ; \
		$(call GoPackage/Build/Compile) ; \
	)
endef

define Package/duck/install
	$(call GoPackage/Package/Install/Bin,$(1))

	$(INSTALL_DIR) $(1)/etc/duck/
	$(INSTALL_CONF) $(PKG_BUILD_DIR)/example.dae $(1)/etc/duck/

	$(INSTALL_DIR) $(1)/etc/config
	$(INSTALL_CONF) $(CURDIR)/files/duck.config $(1)/etc/config/duck

	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_BIN) $(CURDIR)/files/duck.init $(1)/etc/init.d/duck
endef

define Package/duck-geoip/install
	$(INSTALL_DIR) $(1)/usr/share/dae
	$(INSTALL_DATA) $(DL_DIR)/$(GEOIP_FILE) $(1)/usr/share/dae/geoip.dat
endef

define Package/duck-geosite/install
	$(INSTALL_DIR) $(1)/usr/share/dae
	$(INSTALL_DATA) $(DL_DIR)/$(GEOSITE_FILE) $(1)/usr/share/dae/geosite.dat
endef

$(eval $(call GoBinPackage,duck))
$(eval $(call BuildPackage,duck))
$(eval $(call BuildPackage,duck-geoip))
$(eval $(call BuildPackage,duck-geosite))
