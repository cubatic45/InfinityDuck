const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('luci-app-duck/htdocs/luci-static/resources/view/duck/log.js', 'utf8');
const acl = JSON.parse(fs.readFileSync('luci-app-duck/root/usr/share/rpcd/acl.d/luci-app-duck.json'))['luci-app-duck'];
const logPath = '/var/log/duck/duck.log';

// LuCI provides this formatting helper in the browser.
String.prototype.format = function (...args) {
  let index = 0;
  return this.replace(/%s/g, () => String(args[index++]));
};

function setup({ writable = true, failWrite = false } = {}) {
  const nodes = {}, notifications = [], writes = [];
  let modal, refresh, content = 'info existing log';
  function E(tag, attrs = {}, children = []) {
    const node = {
      tag, attrs, children: Array.isArray(children) ? children : [children],
      innerHTML: '', value: '',
      addEventListener(type, callback) { this[type] = callback; },
      querySelector(tag) { return this.children.find(child => child.tag === tag); }
    };
    if (attrs.id) nodes[attrs.id] = node;
    return node;
  }
  const view = new Function('view', 'fs', 'poll', 'ui', 'dom', 'E', '_', 'L', 'document', source)(
    { extend: value => value },
    {
      read_direct: async () => content,
      write: async (path, data) => {
        // Model both independent gates enforced by ubus/rpcd.
        if (!writable || !acl.write.ubus.file?.includes('write') || !acl.write.file[path]?.includes('write'))
          throw Error('Permission denied');
        if (failWrite) throw Error('Disk error');
        writes.push([path, data]);
        content = data;
      }
    },
    { add: callback => { refresh = callback; } },
    {
      showModal: (title, children) => { modal = children; },
      hideModal: () => {},
      addNotification: (...args) => notifications.push(args)
    },
    { content: (node, child) => { node.children = [child]; } },
    E, value => value,
    { resource: value => value, bind: callback => callback, env: { pollinterval: 5 } },
    { getElementById: id => nodes[id] }
  );
  view.render();
  return {
    nodes, notifications, writes, refresh,
    confirm: () => {
      nodes.clearLogButton.click();
      return modal[1].children[1].attrs.click();
    },
    cancel: () => {
      nodes.clearLogButton.click();
      modal[1].children[0].attrs.click();
    },
    displayed: () => nodes.log_textarea.querySelector('pre').innerHTML
  };
}

test('log ACL grants write RPC only to writers and limits file writes to the log', () => {
  assert.deepEqual(acl.write.ubus.file, ['write']);
  assert.equal(acl.read.ubus.file, undefined);
  assert.deepEqual(acl.write.file, { [logPath]: ['write'] });
});

test('confirmed clear succeeds through both permission gates and stays empty after refresh', async () => {
  const page = setup();
  await page.refresh();
  await page.confirm();
  assert.deepEqual(page.writes, [[logPath, '']]);
  assert.equal(page.notifications[0][2], 'success');
  assert.equal(page.displayed(), 'Log is empty.');
  await page.refresh();
  assert.equal(page.displayed(), 'Log is empty.');
});

test('cancel leaves the log unchanged', async () => {
  const page = setup();
  await page.refresh();
  const before = page.displayed();
  page.cancel();
  assert.deepEqual(page.writes, []);
  assert.deepEqual(page.notifications, []);
  assert.equal(page.displayed(), before);
});

test('permission and filesystem failures preserve the displayed log and report failure', async () => {
  for (const options of [{ writable: false }, { failWrite: true }]) {
    const page = setup(options);
    await page.refresh();
    const before = page.displayed();
    await page.confirm();
    assert.deepEqual(page.writes, []);
    assert.equal(page.notifications[0][2], 'error');
    assert.equal(page.displayed(), before);
  }
});
