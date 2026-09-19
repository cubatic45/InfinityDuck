const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const source = fs.readFileSync('luci-app-duck/htdocs/luci-static/resources/view/duck/config.js', 'utf8');
function setup(reply) {
  const calls = [], notifications = [];
  const v = new Function('rpc', 'view', 'ui', 'E', '_', 'fs', 'window', source)(
    { declare: spec => { assert.equal(spec.reject, true); return async (...args) => { calls.push(args); return typeof reply === 'function' ? reply(...args) : reply; }; } },
    { extend: x => x }, { addNotification: (...a) => notifications.push(a) },
    (...a) => a, x => x, { read_direct: async () => '' }, {setTimeout: callback => setTimeout(callback,0)});
  v.textarea = { value: 'global {}' };
  v.savedValue = 'old'; v.status = {};
  return { v, calls, notifications };
}
test('save uses current editor text, regardless of old markers', async () => {
  const { v, calls } = setup({ saved: true, applied: true, error: '' });
  v.editorInstance = { getValue: () => 'global { # (\n}\n' };
  await v.handleSaveApply();
  assert.deepEqual(calls, [['global { # (\n}\n', true]]);
  assert.equal(v.dirty, false);
});
test('save-only and reset operate on the last successful save', async () => {
  const { v, calls } = setup({ saved: true, applied: false, error: '' });
  await v.handleSave();
  assert.equal(calls[0][1], false);
  v.textarea.value = 'changed'; v.handleReset();
  assert.equal(v.textarea.value, 'global {}');
});
test('whitespace does not reach backend', async () => {
  const { v, calls } = setup(); v.textarea.value = '\n \t';
  await v.handleSaveApply(); assert.equal(calls.length, 0);
});
test('validation failure retains dirty text and displays error', async () => {
  const { v, notifications } = setup({ saved: false, applied: false, error: 'line 4: invalid syntax' });
  await v.handleSaveApply();
  assert.equal(v.savedValue, 'old'); assert.equal(v.dirty, true);
  assert.equal(notifications[0][1][1], 'line 4: invalid syntax');
});
test('saved but failed apply is distinguished from validation failure', async () => {
  const { v, notifications } = setup({ saved: true, applied: false, error: 'reload failed' });
  await v.handleSaveApply();
  assert.equal(v.savedValue, 'global {}');
  assert.equal(notifications[0][2], 'error');
});
test('transport rejection and malformed reply are not success', async () => {
  for (const reply of [false, {}, () => { throw Error('Access denied'); }]) {
    const { v, notifications } = setup(reply); await v.handleSaveApply();
    assert.equal(v.savedValue, 'old'); assert.equal(notifications[0][2], 'error');
  }
});
test('concurrent clicks share one request; edits during save remain dirty', async () => {
  let complete;
  const { v, calls } = setup(() => new Promise(r => complete = r));
  const a = v.handleSaveApply(), b = v.handleSaveApply();
  assert.equal(a, b); assert.equal(calls.length, 1);
  v.textarea.value = 'newer'; complete({ saved: true, applied: true, error: '' });
  await a; assert.equal(v.savedValue, 'global {}'); assert.equal(v.dirty, true);
});

test('asynchronous validation/apply polls until completion without resubmitting', async () => {
  let step=0;
  const {v,calls}=setup(()=>[
    {saved:false,applied:false,pending:true,job:'abc123',error:''},
    {saved:true,applied:false,pending:true,job:'abc123',error:''},
    {saved:true,applied:true,pending:false,job:'abc123',error:''}
  ][step++]);
  await v.handleSaveApply();
  assert.deepEqual(calls,[['global {}',true],['abc123'],['abc123']]);
  assert.equal(v.dirty,false);
});
