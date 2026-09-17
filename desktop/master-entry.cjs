const {app}=require('electron');
const fs=require('node:fs/promises');
const path=require('node:path');
require('./master.cjs');
require('./portal-adaptive.cjs');

app.on('browser-window-created',(_event,win)=>{
  win.webContents.on('did-finish-load',async()=>{
    const url=win.webContents.getURL();
    if(!url.startsWith('file://')||!url.toLowerCase().includes('renderer/index.html'))return;
    try{
      const script=await fs.readFile(path.join(__dirname,'renderer','adaptive.js'),'utf8');
      await win.webContents.executeJavaScript(script,true);
    }catch(e){console.error('adaptive_renderer_inject_error',String(e?.message||e).slice(0,300))}
  });
});
