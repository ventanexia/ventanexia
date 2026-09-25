'use strict';
/* ============================================================================
 * VentaNexIA Desktop - updater.cjs
 * Base: 0.6.158 + interruptor de seguridad
 * ----------------------------------------------------------------------------
 * La actualización automática SOLO se activa cuando app-update.yml declara
 * publisherName. Para pruebas internas puede forzarse con:
 *   VNX_AUTO_UPDATE_UNSIGNED=1
 * ==========================================================================*/

const {app}=require('electron');
const fs=require('node:fs');
const path=require('node:path');

const CHECK_INTERVAL_MS=6*60*60*1000;
const FIRST_CHECK_MS=20*1000;

let started=false;
let autoUpdater=null;
let timer=null;

let estado={
  activo:false,
  motivo:'sin iniciar',
  version:app.getVersion(),
  canal:null,
  origen:null,
  firmaVerificada:false,
  ultimaComprobacion:null,
  disponible:null,
  descargada:false,
  error:null
};

function leerFeed(){
  try{
    const file=path.join(process.resourcesPath||'','app-update.yml');
    const txt=fs.readFileSync(file,'utf8');
    const campo=n=>{
      const m=txt.match(new RegExp('^\\s*'+n+'\\s*:\\s*(.+?)\\s*$','mi'));
      return m?m[1].replace(/^["']|["']$/g,''):null;
    };
    return {
      provider:campo('provider'),
      owner:campo('owner'),
      repo:campo('repo'),
      url:campo('url'),
      channel:campo('channel'),
      publisherName:campo('publisherName')
    };
  }catch{return null}
}

function permitido(feed){
  if(!app.isPackaged)return {ok:false,motivo:'ejecución sin empaquetar'};
  if(!feed)return {ok:false,motivo:'no se ha podido leer app-update.yml'};
  if(feed.publisherName)return {ok:true,motivo:'feed firmado ('+feed.publisherName+')',firmada:true};
  if(process.env.VNX_AUTO_UPDATE_UNSIGNED==='1')
    return {ok:true,motivo:'forzado por VNX_AUTO_UPDATE_UNSIGNED (solo pruebas internas)',firmada:false};
  return {ok:false,motivo:'el instalador no está firmado: app-update.yml no declara publisherName'};
}

function start(){
  if(started)return estado;
  started=true;

  const feed=leerFeed();
  estado.origen=feed?(feed.url||[feed.provider,feed.owner,feed.repo].filter(Boolean).join(':')||null):null;
  estado.canal=feed?.channel||'latest';

  const permiso=permitido(feed);
  estado.activo=permiso.ok;
  estado.motivo=permiso.motivo;
  estado.firmaVerificada=Boolean(permiso.firmada);

  if(feed&&feed.owner&&feed.repo&&feed.owner===feed.repo){
    console.warn('auto_update_feed_warning','app-update.yml apunta al repositorio del código fuente ('+feed.owner+'/'+feed.repo+'). Si pasa a privado, las actualizaciones devolverán 404. Usa un repositorio público solo para binarios.');
  }

  if(!permiso.ok){
    console.warn('auto_update_disabled',permiso.motivo);
    return estado;
  }
  if(!permiso.firmada){
    console.warn('auto_update_unsigned','Actualización automática activa SIN verificación de firma. No distribuir así.');
  }

  try{
    autoUpdater=require('electron-updater').autoUpdater;
  }catch(e){
    estado.activo=false;
    estado.motivo='no se ha podido cargar electron-updater';
    estado.error=String(e?.message||e).slice(0,200);
    console.error('auto_update_load_error',estado.error);
    return estado;
  }

  autoUpdater.autoDownload=true;
  autoUpdater.autoInstallOnAppQuit=true;
  autoUpdater.allowPrerelease=false;
  autoUpdater.allowDowngrade=false;
  autoUpdater.logger={
    info:(...a)=>console.log('updater_info',...a),
    warn:(...a)=>console.warn('updater_warn',...a),
    error:(...a)=>console.error('updater_error',...a),
    debug:()=>{}
  };

  autoUpdater.on('update-available',i=>{estado.disponible=i?.version||null;estado.error=null});
  autoUpdater.on('update-not-available',()=>{estado.disponible=null});
  autoUpdater.on('update-downloaded',i=>{estado.descargada=true;estado.disponible=i?.version||estado.disponible});
  autoUpdater.on('error',e=>{
    estado.error=String(e?.message||e).slice(0,300);
    console.error('auto_update_error',estado.error);
  });

  const check=()=>{
    estado.ultimaComprobacion=new Date().toISOString();
    return autoUpdater.checkForUpdatesAndNotify()
      .catch(e=>{estado.error=String(e?.message||e).slice(0,300);console.error('auto_update_check_error',estado.error)});
  };

  const primera=setTimeout(check,FIRST_CHECK_MS);primera.unref?.();
  timer=setInterval(check,CHECK_INTERVAL_MS);timer.unref?.();

  return estado;
}

function status(){return {...estado}}

async function checkNow(){
  if(!estado.activo||!autoUpdater){
    return {...estado,mensaje:'Las actualizaciones automáticas están desactivadas: '+estado.motivo};
  }
  estado.ultimaComprobacion=new Date().toISOString();
  try{
    await autoUpdater.checkForUpdates();
    return {...estado,mensaje:estado.disponible?('Hay una versión nueva: '+estado.disponible):'Ya tienes la última versión.'};
  }catch(e){
    estado.error=String(e?.message||e).slice(0,300);
    return {...estado,mensaje:'No se ha podido comprobar: '+estado.error};
  }
}

module.exports={start,status,checkNow};
