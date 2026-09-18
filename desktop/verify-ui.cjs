const fs=require('node:fs');
const path=require('node:path');
const root=__dirname;
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const html=read('renderer/index.html');
const app=read('renderer/app.js');
const master=read('renderer/master.js');
const adaptive=read('renderer/adaptive.js');
const exp=read('renderer/export.js');
const preload=read('preload.cjs');
const mains=['main.cjs','master.cjs','portal-adaptive.cjs','portal-pagination-fix.cjs','export.cjs'].map(read).join('\n');
const scripts=[app,master,adaptive,exp].join('\n');
const errors=[];
if(!/<script\s+src=["']master\.js["']><\/script>/i.test(html))fail('renderer/index.html no carga master.js; el selector de agentes no se ejecutará.');
const fail=(x)=>errors.push(x);

if(app.includes('$$$('))fail('renderer/app.js contiene $$$(): selector inválido.');
for(const m of app.matchAll(/(^|[^$])\$\([^)\n]+\)\.forEach/g))fail('renderer/app.js usa querySelector().forEach: '+m[0].trim());
for(const m of master.matchAll(/(?<!\$)\$m\([^)\n]+\)\.forEach/g))fail('renderer/master.js usa querySelector().forEach: '+m[0]);
for(const m of adaptive.matchAll(/(?<!\$)\$a\([^)\n]+\)\.forEach/g))fail('renderer/adaptive.js usa querySelector().forEach: '+m[0]);
for(const m of exp.matchAll(/(?<!\$)\$e\([^)\n]+\)\.forEach/g))fail('renderer/export.js usa querySelector().forEach: '+m[0]);

const ids=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]));
for(const [name,src,re] of [
  ['app.js',app,/\$\('#([^']+)'\)/g],
  ['master.js',master,/\$m\('#([^']+)'\)/g],
  ['adaptive.js',adaptive,/\$a\('#([^']+)'\)/g],
  ['export.js',exp,/\$e\('#([^']+)'\)/g]
]){
  for(const m of src.matchAll(re))if(!ids.has(m[1]))fail(name+' referencia #'+m[1]+' que no existe en index.html');
}

const exposed=new Set([...preload.matchAll(/\n\s*([A-Za-z0-9_]+):/g)].map(m=>m[1]));
for(const m of scripts.matchAll(/window\.vnx\.([A-Za-z0-9_]+)/g))if(!exposed.has(m[1]))fail('Renderer usa window.vnx.'+m[1]+' pero preload no lo expone.');

const invokes=new Set([...preload.matchAll(/ipcRenderer\.invoke\('([^']+)'/g)].map(m=>m[1]));
const handlers=new Set([...mains.matchAll(/ipcMain\.(?:handle|on)\('([^']+)'/g)].map(m=>m[1]));
for(const ch of invokes)if(!handlers.has(ch))fail('Preload invoca '+ch+' pero no existe handler IPC.');

for(const m of html.matchAll(/<button\b([^>]*)>/gi)){
  const attrs=m[1];
  if(/\bdisabled\b/i.test(attrs)||/\btype="submit"/i.test(attrs))continue;
  if(/\bdata-(?:tab|tab-jump|real-module|master-query|usage-pack|action)=/i.test(attrs))continue;
  const id=(attrs.match(/\bid="([^"]+)"/i)||[])[1];
  if(!id)continue;
  if(!scripts.includes("'#"+id+"'")&&!scripts.includes('"#'+id+'"')&&!scripts.includes("'"+id+"'")&&!scripts.includes('"'+id+'"'))fail('Botón #'+id+' no tiene manejador detectable.');
}

for(const m of html.matchAll(/\bdata-tab="([^"]+)"/g))if(!html.includes('id="'+m[1]+'"'))fail('Navegación apunta a pestaña inexistente: '+m[1]);
for(const m of html.matchAll(/\bdata-tab-jump="([^"]+)"/g))if(!html.includes('id="'+m[1]+'"'))fail('Acceso rápido apunta a pestaña inexistente: '+m[1]);

if(!app.includes("$$('[data-real-module]').forEach"))fail('No se detecta el enlace de botones de conexiones reales.');
if(!app.includes("$$('[data-usage-pack]').forEach"))fail('No se detecta el enlace de botones de créditos.');
if(!master.includes("$$m('[data-master-query]').forEach"))fail('No se detecta el enlace de botones del Centro Maestro.');

if(errors.length){
  console.error('\nVENTANEXIA UI VERIFY FAILED\n- '+errors.join('\n- '));
  process.exit(1);
}
console.log('VentaNexIA UI verify OK: selectores, botones, IDs, bridge e IPC comprobados.');
