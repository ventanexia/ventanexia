const fs=require('fs'),path=require('path'),vm=require('vm');
const root=__dirname;
const rendererDir=path.join(root,'renderer');
const files=['renderer/app.js','renderer/master.js','renderer/adaptive.js','renderer/export.js','preload.cjs','main.cjs','master.cjs','master-entry.cjs','export.cjs','portal-adaptive.cjs','portal-pagination-fix.cjs'];
const content={};
for(const rel of files){
  const p=path.join(root,rel);
  const c=fs.readFileSync(p,'utf8');
  content[rel]=c;
  try{new vm.Script(c,{filename:rel});}catch(e){throw new Error('Syntax error in '+rel+': '+e.message)}
}
const app=content['renderer/app.js'],master=content['renderer/master.js'];
const forbidden=[
  [app,/\$\$\$\(/g,'triple-dollar selector'],
  [app,/(^|[^$])\$\([^\)\n]+\)\.forEach/g,'querySelector used as a list'],
  [master,/(^|[^$])\$m\([^\)\n]+\)\.forEach/g,'master querySelector used as a list']
];
for(const [src,re,label] of forbidden){if(re.test(src))throw new Error('Renderer audit failed: '+label)}
const rendererAll=['renderer/app.js','renderer/master.js','renderer/adaptive.js','renderer/export.js'].map(x=>content[x]).join('\n');
const preload=content['preload.cjs'];
const used=[...rendererAll.matchAll(/window\.vnx\.([A-Za-z0-9_]+)/g)].map(m=>m[1]);
const exposed=[...preload.matchAll(/\n\s*([A-Za-z0-9_]+):/g)].map(m=>m[1]);
for(const name of new Set(used)){if(!exposed.includes(name))throw new Error('Renderer uses window.vnx.'+name+' but preload does not expose it')}
const allMain=['main.cjs','master.cjs','master-entry.cjs','export.cjs','portal-adaptive.cjs','portal-pagination-fix.cjs'].map(x=>content[x]).join('\n');
const invokes=[...preload.matchAll(/ipcRenderer\.invoke\('([^']+)'/g)].map(m=>m[1]);
const handles=[...allMain.matchAll(/ipcMain\.(?:handle|on)\('([^']+)'/g)].map(m=>m[1]);
for(const ch of new Set(invokes)){if(!handles.includes(ch))throw new Error('Preload invokes '+ch+' but no IPC handler exists')}
const html=fs.readFileSync(path.join(rendererDir,'index.html'),'utf8');
const ids=[...rendererAll.matchAll(/\$\('#([^']+)'\)/g)].map(m=>m[1]);
for(const id of new Set(ids)){if(!html.includes('id="'+id+'"'))throw new Error('Renderer references missing element #'+id)}
const realButtons=(html.match(/data-real-module=/g)||[]).length;
if(realButtons<1)throw new Error('No real connection buttons found');
if(!app.includes("$$('[data-real-module]').forEach"))throw new Error('Real connection buttons are not bound through querySelectorAll');
console.log('VentaNexIA renderer smoke audit OK · '+realButtons+' real connection buttons checked · '+new Set(invokes).size+' IPC channels checked.');
