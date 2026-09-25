'use strict';
const {app}=require('electron');
let started=false;
function start(){
  if(started||!app.isPackaged)return;started=true;
  const electronUpdater=require('electron-updater');
  const autoUpdater=electronUpdater.autoUpdater;
  autoUpdater.autoDownload=true;
  autoUpdater.autoInstallOnAppQuit=true;
  autoUpdater.allowPrerelease=false;
  autoUpdater.logger={
    info:(...a)=>console.log('updater_info',...a),
    warn:(...a)=>console.warn('updater_warn',...a),
    error:(...a)=>console.error('updater_error',...a),
    debug:(...a)=>console.debug('updater_debug',...a)
  };
  autoUpdater.on('error',e=>console.error('auto_update_error',String(e?.message||e).slice(0,300)));
  const check=()=>autoUpdater.checkForUpdatesAndNotify().catch(e=>console.error('auto_update_check_error',String(e?.message||e).slice(0,300)));
  setTimeout(check,20000);
  setInterval(check,6*60*60*1000);
}
module.exports={start};
