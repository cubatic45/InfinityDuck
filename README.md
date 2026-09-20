<div align="center">

# InfinityDuck
This project is based on [luci-app-dae](https://github.com/immortalwrt/luci/tree/master/applications/luci-app-dae), originally maintained by [Tianling Shen](https://github.com/1715173329).

<img src="img/duck.png" border="0" width="16%"></p><br>
</div>

## New Features:
- Powerful config editor provided by monaco-editor
- Latest commit version of dae core
- Reversed log order with scrollbar
- Log highlighting and filtering
- Daemon-backed configuration validation and atomic saves
- Fetch config from remote
- Startup deplay
- Schedule restart

## Configuration editor

The editor uses Monaco 0.56.0 with locally bundled ESM assets and an editor
worker. It follows the LuCI language for simplified/traditional Chinese and
otherwise uses English. If the advanced editor cannot load, a plain text area
remains available. Unsaved edits are indicated, and leaving the page prompts
before discarding them.

`Save` validates with `dae validate` and saves without changing service state.
`Save & Apply` validates, saves, and hot-reloads a running service; a stopped,
enabled service is started without downloading a subscription over the edited
file or waiting for the boot delay. Errors distinguish validation failure from
a configuration that was saved but could not be applied. `Reset` restores the
last successfully saved content.

Validation runs against a private temporary file in `/etc/duck` to preserve
relative include paths. The original entry file is replaced atomically only
after validation succeeds, with permissions `0600`. A write-only `duck.config`
RPC serializes editor transactions with `flock`. Background work and status
polling keep long validation/reload operations out of LuCI's short RPC timeout.
Status records expire after an hour on subsequent saves and on reboot.
The editor intentionally supports the default `/etc/duck/config.dae` entry;
custom UCI entry paths are rejected rather than silently editing another file.

Upgrade both `duck` (including the updated init script) and `luci-app-duck`
together. The LuCI package adds `jshn` and `flock` dependencies. After manually
replacing files, restart `rpcd` and reload LuCI to register the new RPC/ACL.

### Rebuilding editor assets and testing

Generated assets are committed, so normal OpenWrt package builds do not need
Node.js and router pages do not fetch code from a CDN. Maintainers can rebuild
using Node.js 20 and the locked npm dependencies:

```sh
npm ci
npm run build:editor
npm test
npx playwright install chromium
npm run test:browser
```

The Node tests require `busybox`, `jq`, and `flock`. They exercise the real shell
transaction with isolated paths, a test JSON adapter, and mocked dae/service
commands. Browser tests load the actual generated Monaco assets and exercise
editing, a worker-backed diff, localization, fallback, and disposal. These tests
do not substitute for an OpenWrt package build or real rpcd/procd/dae integration
on a router. CI also checks that rebuilding produces the committed assets.

Monaco is pinned to 0.56.0; DOMPurify is overridden to 3.4.15 to avoid the
advisories affecting the dependency version requested by Monaco. Keep the lock
file, generated assets, and third-party license notices in sync when updating.

## Install
1. Add feed
```shell
# only needs to be run once
curl -s -L https://github.com/JohnsonRan/InfinitySubstance/raw/main/feed.sh | ash
```

2. Install
```shell
# you can install from shell or `Software` menu in LuCI
# for opkg
opkg install duck
opkg install luci-app-duck
opkg install luci-i18n-duck-zh-cn
# for apk
apk add --allow-untrusted duck
apk add --allow-untrusted luci-app-duck
apk add --allow-untrusted luci-i18n-duck-zh-cn
```

## Compilation
1. Install dependencies
```
apt update
apt install -y clang-19 llvm-19
```
2. Enable eBPF support, add below to `.config`:
```
CONFIG_DEVEL=y
CONFIG_KERNEL_DEBUG_INFO=y
CONFIG_KERNEL_DEBUG_INFO_REDUCED=n
CONFIG_KERNEL_DEBUG_INFO_BTF=y
CONFIG_KERNEL_CGROUPS=y
CONFIG_KERNEL_CGROUP_BPF=y
CONFIG_KERNEL_BPF_EVENTS=y
CONFIG_BPF_TOOLCHAIN_HOST=y
CONFIG_KERNEL_XDP_SOCKETS=y
CONFIG_PACKAGE_kmod-xdp-sockets-diag=y
```
3. Build InfinityDuck
```
git clone https://github.com/JohnsonRan/InfinityDuck package/new/InfinityDuck
make package/new/InfinityDuck/luci-app-duck/compile
```
- Or you can try [this](https://github.com/JohnsonRan/opwrt_build_script/releases) prebuilt firmware if you are using **x86_64** or **NanoPi R5S**
## Special Thanks
- [Percy Ma](https://marketplace.visualstudio.com/items?itemName=kecrily.dae)
- [Tianling Shen](https://github.com/1715173329)
- [morytyann](http://github.com/morytyann)
- [AopisL](https://github.com/apoiston)
- Claude 3.7 Sonnet  
And more...

## Screenshots
<details>
 <p>
  <img src="img/ss3.png" alt="settings">
  <img src="img/ss1.png" alt="config">
  <img src="img/ss2.png" alt="log">
 </p>
</details>
