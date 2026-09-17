const {app}=require('electron');
const fs=require('node:fs/promises');
const path=require('node:path');
require('./master.cjs');
require('./portal-adaptive.cjs');
require('./portal-pagination-fix.cjs');
require('./export.cjs');

app.on('browser-window-created',(_event,win)=>{
  win.webContents.on('did-finish-load',async()=>{
    const url=win.webContents.getURL();
    if(!url.startsWith('file://')||!url.toLowerCase().includes('renderer/index.html'))return;
    try{
      const adaptive=await fs.readFile(path.join(__dirname,'renderer','adaptive.js'),'utf8');
      await win.webContents.executeJavaScript(adaptive,true);
      const exportsUi=await fs.readFile(path.join(__dirname,'renderer','export.js'),'utf8');
      await win.webContents.executeJavaScript(exportsUi,true);
    }catch(e){console.error('master_renderer_inject_error',String(e?.message||e).slice(0,300))}
  });
});
