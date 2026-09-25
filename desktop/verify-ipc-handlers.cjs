'use strict';
const fs=require('node:fs'),path=require('node:path');
const runtimeFiles=[
  'main.cjs','master.cjs','master-entry.cjs','portal-adaptive.cjs','portal-pagination-fix.cjs','export.cjs',
  'orders.cjs','erp.cjs','calendar.cjs','external-agent.cjs','prospecting.cjs','agent-email.cjs','agent-policy.cjs',
  'gmail-auth.cjs','shopify-auth.cjs','shopify-stores.cjs','state-store.cjs','order-files.cjs','orders-core.cjs'
];
const calls=[];
for(const file of runtimeFiles){
  const src=fs.readFileSync(path.join(__dirname,file),'utf8');
  for(const kind of ['handle','on']){
    const re=new RegExp("ipcMain\\."+kind+"\\(\\s*['\"\x60]([^'\"\x60]+)['\"\x60]","g");
    let m;while((m=re.exec(src)))calls.push({kind,channel:m[1],file,index:m.index});
  }
}
const grouped=new Map();
for(const x of calls){
  const key=x.kind+':'+x.channel;
  if(!grouped.has(key))grouped.set(key,[]);
  grouped.get(key).push(x);
}
const allowed=new Set();
const bad=[...grouped.entries()].filter(([key,list])=>list.length>1&&!allowed.has(key));
if(bad.length){
  console.error('IPC_DUPLICATE_VERIFY_FAIL:',bad.map(([key,list])=>key+' -> '+list.map(x=>x.file).join(', ')).join(' | '));
  process.exit(1);
}
const chat=grouped.get('handle:chat:send')||[];
if(chat.length!==1||chat[0]?.file!=='master-entry.cjs'){
  console.error('IPC_DUPLICATE_VERIFY_FAIL: chat:send must be registered exactly once in master-entry.cjs; found '+chat.map(x=>x.file).join(', '));
  process.exit(1);
}
const entry=fs.readFileSync(path.join(__dirname,'master-entry.cjs'),'utf8');
function need(re,msg){if(!re.test(entry)){console.error('IPC_DUPLICATE_VERIFY_FAIL:',msg);process.exit(1)}}
function forbid(re,msg){if(re.test(entry)){console.error('IPC_DUPLICATE_VERIFY_FAIL:',msg);process.exit(1)}}
need(/ipcMain\.handle\('chat:send'/,'master-entry.cjs must register the single canonical chat handler');
forbid(/originalHandle\('chat:send'/,'chat routing must not depend on an ipcMain.handle monkeypatch');
const master=fs.readFileSync(path.join(__dirname,'master.cjs'),'utf8');
const portal=fs.readFileSync(path.join(__dirname,'portal-adaptive.cjs'),'utf8');
if(!/module\.exports=\{chatSendHandler\}/.test(master)){console.error('IPC_DUPLICATE_VERIFY_FAIL: master.cjs must export chatSendHandler');process.exit(1)}
if(!/chatSendHandler/.test(portal)||!/module\.exports=\{[^}]*chatSendHandler/.test(portal)){console.error('IPC_DUPLICATE_VERIFY_FAIL: portal-adaptive.cjs must export chatSendHandler');process.exit(1)}
forbid(/ipcMain\.handle\('orders:export-ready'/,'orders:export-ready must be registered only in master.cjs');
forbid(/ipcMain\.handle\('secretary:notify'/,'secretary:notify must be registered only in main.cjs');
console.log('IPC_DUPLICATE_VERIFY_OK · '+calls.length+' static IPC registrations audited');
