'use strict';
const fs=require('node:fs');
const path=require('node:path');

let installed=false;
function safeText(v,n=1800){
  return String(v==null?'':v)
    .replace(/(authorization|token|secret|password|contrase(?:n|ñ)a|api[_ -]?key|cookie)\s*[:=]\s*[^\s,;]+/gi,'$1=[REDACTED]')
    .slice(0,n);
}
function install({app}={}){
  if(installed||!app)return;installed=true;
  const file=()=>path.join(app.getPath('userData'),'logs','runtime-errors.jsonl');
  function record(type,error,extra={}){
    try{
      const target=file();fs.mkdirSync(path.dirname(target),{recursive:true});
      const row={at:new Date().toISOString(),type,version:app.getVersion(),platform:process.platform,message:safeText(error?.message||error),stack:safeText(error?.stack||'',5000),...extra};
      fs.appendFileSync(target,JSON.stringify(row)+'\n','utf8');
    }catch{}
  }
  process.on('uncaughtException',e=>{record('uncaughtException',e);console.error('uncaughtException',e)});
  process.on('unhandledRejection',e=>{record('unhandledRejection',e);console.error('unhandledRejection',e)});
  app.on('render-process-gone',(_event,webContents,details)=>record('render-process-gone',details?.reason||'unknown',{reason:details?.reason||'',exitCode:details?.exitCode??null,url:safeText(webContents?.getURL?.()||'',500)}));
  app.on('child-process-gone',(_event,details)=>record('child-process-gone',details?.reason||'unknown',{reason:details?.reason||'',exitCode:details?.exitCode??null,serviceName:safeText(details?.serviceName||'',200),name:safeText(details?.name||'',200)}));
  app.on('certificate-error',(_event,_webContents,url,error)=>record('certificate-error',error,{url:safeText(url,500)}));
}
module.exports={install};
