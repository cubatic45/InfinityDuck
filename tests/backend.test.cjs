const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const backend = fs.readFileSync('luci-app-duck/root/usr/libexec/rpcd/duck.config','utf8');
function fixture(t) {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'duck-backend-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 for(const p of ['config','locks','bin','jobs']) fs.mkdirSync(path.join(dir,p));
 const config=path.join(dir,'config/config.dae'), trace=path.join(dir,'trace');
 fs.writeFileSync(config,'ORIGINAL\n'); fs.chmodSync(config,0o600);
 const write=(name,body)=>{fs.writeFileSync(path.join(dir,'bin',name),'#!/bin/sh\n'+body);fs.chmodSync(path.join(dir,'bin',name),0o755);};
 write('uci','printf "%s" "${CUSTOM_CONFIG:-$FIXTURE/config/config.dae}"\n');
 write('dae',`printf 'validate:%s\\n' "$3" >> "$FIXTURE/trace"
[ "$1" = validate ] && [ "$2" = -c ] || exit 9
[ "\${3##*.}" = dae ] || { echo "invalid config filename $3: must has suffix .dae" >&2; exit 11; }
[ "$(stat -c %a "$3")" = 600 ] || exit 10
[ "$FAIL_VALIDATE" != 1 ] || { echo 'line 3: invalid config' >&2; exit 1; }
[ "$SLOW_VALIDATE" != 1 ] || /bin/sleep 1
cp "$3" "$FIXTURE/validated"
`);
 write('service',`printf '%s\\n' "$1" >> "$FIXTURE/trace"
case "$1" in
 editor_apply) [ "$FAIL_APPLY" != 1 ] || { echo 'reload failed'; exit 1; } ;;
 running) [ "$NOT_RUNNING" != 1 ] ;;
 *) exit 9 ;;
esac
`);
 write('mktemp','[ "$FAIL_TEMP" != 1 ] || exit 1\nexec /usr/bin/mktemp "$@"\n');
 write('ln','[ "$FAIL_LINK" != 1 ] || exit 1\nexec /bin/ln "$@"\n');
 write('sleep','exit 0\n');
 write('mv','[ "$FAIL_RENAME" != 1 ] || [ "$3" != "$FIXTURE/config/config.dae" ] || exit 1\nexec /bin/mv "$@"\n');
 const script=backend.replace('/usr/share/libubox/jshn.sh',path.resolve('tests/fixtures/jshn.sh'))
  .replaceAll('/etc/duck',dir+'/config').replaceAll('/var/lock',dir+'/locks').replace('/var/run/duck-editor',dir+'/jobs')
  .replaceAll('/usr/bin/dae',dir+'/bin/dae').replaceAll('/etc/init.d/duck',dir+'/bin/service');
 const helper=path.join(dir,'helper');fs.writeFileSync(helper,script);
 const run=(content,apply=true,env={})=>{
  const r=spawnSync('busybox',['ash',helper,'call','save'],{
   input:JSON.stringify({content,apply}),encoding:'utf8',env:{...process.env,PATH:dir+'/bin:'+process.env.PATH,FIXTURE:dir,...env}
  });
  assert.equal(r.status,0,r.stderr);
  let result=JSON.parse(r.stdout);
  for(let i=0;result.pending && i<600;i++) {
   Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,20);
   const poll=spawnSync('busybox',['ash',helper,'call','status'],{input:JSON.stringify({job:result.job}),encoding:'utf8',env:{...process.env,PATH:dir+'/bin:'+process.env.PATH,FIXTURE:dir,...env}});
   assert.equal(poll.status,0,poll.stderr);result=JSON.parse(poll.stdout);
  }
  assert.equal(result.pending,false,JSON.stringify(result));
  return {saved:result.saved,applied:result.applied,error:result.error};
 };
 return {dir,config,run,helper,trace:()=>fs.existsSync(trace)?fs.readFileSync(trace,'utf8'):''};
}
test('backend validates before atomic replacement, preserves bytes and permissions',t=>{
 const f=fixture(t), content='global { # (\n}\n# "$HOME" `id` $(id) \' \\n\n';
 assert.deepEqual(f.run(content),{saved:true,applied:true,error:''});
 assert.equal(fs.readFileSync(f.config,'utf8'),content);
 assert.equal(fs.readFileSync(f.dir+'/validated','utf8'),content);
 assert.equal(fs.statSync(f.config).mode&0o777,0o600);
 assert.match(f.trace(),/validate:.*\.editor-.*\.dae\neditor_apply\nrunning\n/);
 assert.deepEqual(fs.readdirSync(f.dir+'/config'),['config.dae']);
 assert.equal(spawnSync('flock',['-n',f.dir+'/locks/duck-editor.lock','true']).status,0);
});
test('invalid daemon syntax leaves original file and service untouched',t=>{
 const f=fixture(t),r=f.run('invalid',true,{FAIL_VALIDATE:'1'});
 assert.equal(r.saved,false);assert.match(r.error,/line 3/);
 assert.equal(fs.readFileSync(f.config,'utf8'),'ORIGINAL\n');
 assert.doesNotMatch(f.trace(),/editor_apply/);
});
test('empty and incorrectly typed requests do not touch config',t=>{
 const f=fixture(t);
 for(const value of [' \n\t',null,22,{}]) assert.equal(f.run(value).saved,false);
 assert.equal(f.run('valid','true').saved,false);
 assert.equal(f.trace(),'');
});
test('save-only never changes service state',t=>{
 const f=fixture(t);assert.deepEqual(f.run('new',false),{saved:true,applied:false,error:''});
 assert.doesNotMatch(f.trace(),/editor_apply|running/);
});
test('failed apply accurately reports that the file was already saved',t=>{
 const f=fixture(t),r=f.run('new',true,{FAIL_APPLY:'1'});
 assert.equal(r.saved,true);assert.equal(r.applied,false);assert.match(r.error,/reload failed/);
 assert.equal(fs.readFileSync(f.config,'utf8'),'new');
});
test('disabled/stopped service is not reported as successfully applied',t=>{
 const f=fixture(t),r=f.run('new',true,{NOT_RUNNING:'1'});
 assert.equal(r.saved,true);assert.equal(r.applied,false);assert.match(r.error,/not running/);
});
test('temp creation and replacement failures keep original and release lock',t=>{
 const f=fixture(t);
 for(const env of [{FAIL_TEMP:'1'},{FAIL_LINK:'1'},{FAIL_RENAME:'1'}]) {
  assert.equal(f.run('new',true,env).saved,false);
  assert.equal(fs.readFileSync(f.config,'utf8'),'ORIGINAL\n');
  assert.equal(spawnSync('flock',['-n',f.dir+'/locks/duck-editor.lock','true']).status,0);
  assert.deepEqual(fs.readdirSync(f.dir+'/config'),['config.dae']);
 }
});
test('concurrent save is rejected while another writer owns the flock',t=>{
 const f=fixture(t);
 const result=spawnSync('flock',[f.dir+'/locks/duck-editor.lock','busybox','ash','-c',
  `printf '%s' '{"content":"new","apply":true}' | busybox ash '${f.dir}/helper' call save`],
  {encoding:'utf8',env:{...process.env,PATH:f.dir+'/bin:'+process.env.PATH,FIXTURE:f.dir}});
 assert.equal(result.status,0,result.stderr);
 assert.match(JSON.parse(result.stdout).error,/in progress/);
 assert.equal(fs.readFileSync(f.config,'utf8'),'ORIGINAL\n');
});
test('custom UCI path is rejected rather than silently editing unused config',t=>{
 const f=fixture(t),r=f.run('new',true,{CUSTOM_CONFIG:'/different/config.dae'});
 assert.equal(r.saved,false);assert.equal(f.trace(),'');
});
test('ACL only allows configuration RPC to write users',()=>{
 const acl=JSON.parse(fs.readFileSync('luci-app-duck/root/usr/share/rpcd/acl.d/luci-app-duck.json'))['luci-app-duck'];
 assert.equal(acl.read.ubus['duck.config'],undefined);
 assert.deepEqual(acl.write.ubus['duck.config'],['save','status']);
});
test('init editor apply hot-reloads running service; stopped service receives skip flag',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'duck-init-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const init=fs.readFileSync('duck/files/duck.init','utf8').replaceAll('/etc/init.d/duck','service_stub');
 for(const running of ['0','1']) {
  const program=`extra_command() { :; }\n${init}\nservice_stub() { [ "$RUNNING" = 1 ]; }\nhot_reload() { echo hot_reload; }\nstart() { echo "start:$DUCK_EDITOR_APPLY"; }\neditor_apply\n`;
  const result=spawnSync('busybox',['ash'],{input:program,encoding:'utf8',env:{...process.env,RUNNING:running}});
  assert.equal(result.status,0,result.stderr);assert.equal(result.stdout.trim(),running==='1'?'hot_reload':'start:1');
 }
});

test('background validation returns immediately and keeps exclusive lock until completion',t=>{
 const f=fixture(t);
 const env={...process.env,PATH:f.dir+'/bin:'+process.env.PATH,FIXTURE:f.dir,SLOW_VALIDATE:'1'};
 const start=Date.now();
 const r=spawnSync('busybox',['ash',f.helper,'call','save'],{input:JSON.stringify({content:'new',apply:false}),encoding:'utf8',env});
 const result=JSON.parse(r.stdout);
 assert.equal(result.pending,true);assert.equal(result.saved,false);
 assert.ok(Date.now()-start<900,'RPC should not wait for validation');
 assert.equal(spawnSync('flock',['-n',f.dir+'/locks/duck-editor.lock','true']).status,1);
 assert.match(f.run('second').error,/in progress/);
 assert.equal(fs.readFileSync(f.config,'utf8'),'ORIGINAL\n');
 for(let i=0;i<100;i++) {
  const status=JSON.parse(fs.readFileSync(f.dir+'/jobs/'+result.job,'utf8'));
  if(!status.pending){assert.equal(status.saved,true);break;}
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,30);
 }
 assert.equal(fs.readFileSync(f.config,'utf8'),'new');
 assert.equal(spawnSync('flock',['-n',f.dir+'/locks/duck-editor.lock','true']).status,0);
});
test('status rejects traversal and malformed IDs',t=>{
 const f=fixture(t);
 for(const job of ['../../etc/passwd','abcdef/ghi','abcdefg',null,123]) {
  const r=spawnSync('busybox',['ash',f.helper,'call','status'],{input:JSON.stringify({job}),encoding:'utf8'});
  assert.match(JSON.parse(r.stdout).error,/Invalid operation ID/);
 }
});
test('editor startup skips subscription download and delay; normal startup retains them',()=>{
 const init=fs.readFileSync('duck/files/duck.init','utf8');
 const stubs=`
config_load() { :; }
config_get_bool() { eval "$1=1"; }
config_get() { if [ "$3" = delay ]; then eval "$1=30"; else eval "$1=\\\"\\$4\\\""; fi; }
setup_scheduled_restart() { :; }
update_config_from_url() { echo download; }
sleep() { echo delay; }
log_message() { :; }
procd_open_instance() { :; }
procd_set_param() { :; }
procd_append_param() { :; }
procd_close_instance() { :; }
PROG=true
start_service
`;
 for(const editor of ['0','1']) {
  const result=spawnSync('busybox',['ash'],{input:`extra_command() { :; }\n${init}\n${stubs}`,encoding:'utf8',env:{...process.env,DUCK_EDITOR_APPLY:editor}});
  assert.equal(result.status,0,result.stderr);
  assert.equal(result.stdout,editor==='1'?'':'delay\ndownload\n');
 }
});

test('large configuration is parsed from a file without a single oversized argv',t=>{
 const f=fixture(t),content='global {}\n# '+ 'x'.repeat(256*1024)+'\n';
 const result=f.run(content,false);
 assert.equal(result.saved,true,result.error);
 assert.equal(fs.readFileSync(f.config,'utf8'),content);
});
