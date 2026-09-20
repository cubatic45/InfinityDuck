import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import assert from 'node:assert/strict';
const resourceRoot = resolve('luci-app-duck/htdocs/luci-static/resources');
const view = await readFile(resourceRoot + '/view/duck/config.js', 'utf8');
const harness = String.raw`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"></head><body><div id="notifications"></div><script>
window.E = function(tag, attrs, children) {
 if (typeof attrs !== 'object' || Array.isArray(attrs) || attrs === null) { children=attrs; attrs={}; }
 const el=document.createElement(tag);
 for (const [k,v] of Object.entries(attrs)) el.setAttribute(k,v);
 function add(c) { if(Array.isArray(c)) c.forEach(add); else if(c!=null) el.append(c.nodeType ? c : document.createTextNode(String(c))); }
 add(children); return el;
};
window._=s=>s;
window.L={resource:p=>'/resources/'+p, hasViewPermission:()=>true};
window.calls=[]; window.reply={saved:true,applied:true,error:''};
window.rpc={declare:()=>async (...args)=>{calls.push(args);return reply;}};
window.fs={read_direct:async()=> 'global {\n}\n'};
window.ui={addNotification:(_,el,type)=>{el.dataset.type=type;document.querySelector('#notifications').append(el);}};
window.view={extend:o=>o};
</script><script src="/view.js"></script></body></html>`;
const server = createServer(async (req, res) => {
 try {
  if (req.url === '/') {res.setHeader('Content-Type','text/html');res.end(harness);return;}
  if (req.url === '/view.js') {res.setHeader('Content-Type','text/javascript');res.end('window.app=(function(){'+view+'})(); app.load().then(c=>document.body.append(app.render(c)));');return;}
  const path = resolve(resourceRoot, '.' + req.url.replace('/resources',''));
  if(!path.startsWith(resourceRoot+'/')) {res.writeHead(403).end();return;}
  res.setHeader('Content-Type', ({'.js':'text/javascript','.css':'text/css','.ttf':'font/ttf'})[extname(path)] || 'text/plain');
  res.end(await readFile(path));
 } catch {res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({headless:true});
try {
 const page = await browser.newPage(); page.setDefaultTimeout(15000);
 page.on('console', m=>{if(m.type()==='error') console.error(m.text());});
 const errors=[], requests=[]; page.on('pageerror',e=>{errors.push(e.message);console.error(e);});
 page.on('request',r=>requests.push(r.url()));
 await page.goto(url);
 await page.waitForFunction(()=>!!window.app?.editorInstance);
 await page.evaluate(()=>app.editorInstance.setValue('global { # (\n}\n'));
 await page.evaluate(()=>app.handleSaveApply());
 assert.deepEqual(await page.evaluate(()=>calls[0]), ['global { # (\n}\n',true]);
 assert.equal(await page.evaluate(()=>app.dirty),false);
 await page.evaluate(()=>{app.editorInstance.focus();app.editorInstance.trigger('test','actions.find',null);});
 await page.locator('.find-widget.visible').waitFor();
 assert.match(await page.locator('.find-widget').innerText(), /./);
 await page.waitForFunction(()=>globalThis._VSCODE_NLS_LANGUAGE==='zh-cn');
 // Invoke the real worker-backed diff computation, rather than only fetching its file.
 const diff = await page.evaluate(async()=>{
  const m=await import('/resources/monaco-editor/editor.js');
  const original=m.editor.createModel('old\n','duck'), modified=m.editor.createModel('new\n','duck');
  const host=document.createElement('div');host.style.cssText='height:200px;width:500px';document.body.append(host);
  const d=m.editor.createDiffEditor(host);d.setModel({original,modified});
  return await new Promise((resolve,reject)=>{
   const t=setTimeout(()=>reject(Error('worker diff timed out')),10000);
   const sub=d.onDidUpdateDiff(()=>{clearTimeout(t);const result=d.getLineChanges();sub.dispose();d.dispose();original.dispose();modified.dispose();host.remove();resolve(result.length);});
  });
 });
 assert.ok(diff>0); assert.ok(requests.some(x=>x.endsWith('editor.worker.js')));
 await page.evaluate(()=>app.editorInstance.setValue('edited'));
 assert.equal(await page.evaluate(()=>app.dirty),true);
 await page.evaluate(()=>app.handleReset());
 assert.equal(await page.evaluate(()=>app.getValue()),'global { # (\n}\n');
 await page.evaluate(()=>document.querySelector('.cbi-map').remove());
 await page.waitForFunction(()=>app.editorInstance===null);
 assert.equal(await page.evaluate(async()=> (await import('/resources/monaco-editor/editor.js')).editor.getModels().length),0);
 assert.deepEqual(errors,[]);
 console.log('PASS Monaco 0.56.0: ESM, Chinese UI, edit/save/reset, find, real worker diff, disposal');
 const fallback=await browser.newPage(); fallback.setDefaultTimeout(15000);
 await fallback.route('**/monaco-editor/editor.js',r=>r.abort());
 await fallback.goto(url);
 await fallback.getByText('Advanced editor could not be loaded.',{exact:false}).waitFor();
 await fallback.locator('textarea').fill('global {\n}\n');
 await fallback.evaluate(()=>app.handleSaveApply());
 assert.equal(await fallback.evaluate(()=>calls.length),1);
 assert.equal(await fallback.evaluate(()=>app.dirty),false);
 console.log('PASS failed Monaco load: textarea remains editable and saves');
 const english=await browser.newPage(); english.setDefaultTimeout(15000);
 await english.route('**/',async route=>{const response=await route.fetch();await route.fulfill({response,body:(await response.text()).replace('lang="zh-CN"','lang="en"')});});
 await english.goto(url);
 await english.waitForFunction(()=>!!window.app?.editorInstance);
 assert.equal(await english.evaluate(()=>globalThis._VSCODE_NLS_LANGUAGE),undefined);
 console.log('PASS English locale is not forced to Chinese');
} finally {await browser.close();await new Promise(r=>server.close(r));}
