const fs=require('node:fs');
const path=require('node:path');
const root=__dirname;
const html=fs.readFileSync(path.join(root,'renderer','index.html'),'utf8');
const jsFiles=['app.js','master.js','adaptive.js','export.js','master-control.js'];
const js=jsFiles.map(f=>fs.readFileSync(path.join(root,'renderer',f),'utf8')).join('\n');
const preload=fs.readFileSync(path.join(root,'preload.cjs'),'utf8');
const master=fs.readFileSync(path.join(root,'master.cjs'),'utf8');

function fail(msg){console.error('NAVIGATION_VERIFY_FAIL:',msg);process.exitCode=1}
const tabs=[...html.matchAll(/<section[^>]+class="[^"]*\btab\b[^"]*"[^>]+id="([^"]+)"/g)].map(m=>m[1]);
const jumps=[...html.matchAll(/data-tab-jump="([^"]+)"/g)].map(m=>m[1]);
for(const target of new Set(jumps))if(!tabs.includes(target))fail('data-tab-jump sin pestaña destino: '+target);

const buttonIds=[...html.matchAll(/<button\b[^>]*\bid="([^"]+)"/g)].map(m=>m[1]);
for(const id of buttonIds)if(!js.includes(id))fail('botón con id sin referencia en scripts: '+id);

for(const api of ['listPortals','savePortal','connectPortal','checkPortal','removePortal']){
  if(!preload.includes(api+':'))fail('preload no expone '+api);
}
for(const channel of ['portal:list','portal:save','portal:connect','portal:check','portal:remove']){
  if(!master.includes(channel))fail('master no registra '+channel);
}
if(/function getPortals\(\)[\s\S]{0,200}localStorage/.test(js))fail('queda gestor antiguo de portales en localStorage');
if(/portal-open[\s\S]{0,500}window\.open/.test(js))fail('portal-open sigue usando window.open en vez de sesión persistente');

if(!process.exitCode)console.log('NAVIGATION_VERIFY_OK',JSON.stringify({tabs:tabs.length,tabJumps:jumps.length,buttons:buttonIds.length,portalApis:5}));
