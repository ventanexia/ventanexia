'use strict';
/* ============================================================================
 * VentaNexIA Desktop - state-store.cjs
 * Base: 0.6.158 (control de revisión) + reintento automático
 * ----------------------------------------------------------------------------
 * QUÉ CAMBIA RESPECTO A 0.6.158
 *
 * El control de revisión de la 0.6.158 impide que una escritura pise a otra,
 * pero lanza STATE_CONFLICT y ningún punto del código lo captura: 43 llamadas a
 * writeState() y 68 a audit(). Cualquier audit() de un agente automático durante
 * una operación del usuario hacía que su cambio se perdiera con un error.
 *
 * Ahora, ante un conflicto, writeState:
 *   1. vuelve a leer el estado que hay realmente en disco,
 *   2. reaplica encima SOLO lo que había cambiado quien llamó,
 *   3. y reintenta (hasta 3 veces).
 *
 * Se consigue con una foto del estado tomada en readState(). La fusión es a tres
 * bandas: si una clave no la tocó quien llama, gana el disco; si no la tocó el
 * disco, gana quien llama; si la tocaron los dos y son objetos, se fusiona rama
 * a rama; y si chocan de verdad, gana quien llama, porque es la acción explícita
 * del usuario.
 *
 * El caso habitual — un audit() que solo añade una línea a "activity" mientras
 * el usuario guarda un portal — se resuelve solo: se conservan las dos cosas.
 *
 * No hay que tocar ninguno de los 43 puntos de llamada. La API es la misma.
 * ==========================================================================*/

const {app,safeStorage}=require('electron');
const path=require('node:path');
const fs=require('node:fs/promises');

const storeFile=()=>path.join(app.getPath('userData'),'secure-state.json');
const backupFile=()=>storeFile()+'.bak';
const tmpFile=()=>storeFile()+'.tmp';

const LOCKED=Symbol.for('vnx.lockedSecret');
const REV=Symbol.for('vnx.stateRevision');
const BASE=Symbol.for('vnx.stateBaseline');

const WRITE_RETRIES=3;

function blank(){
  const s={permissions:{folders:[]},activity:[],license:{},portals:[],secret:{}};
  Object.defineProperty(s,REV,{value:0,writable:true,enumerable:false});
  Object.defineProperty(s,BASE,{value:snapshot(s),writable:true,enumerable:false});
  return s;
}
function encryptionOk(){try{return Boolean(safeStorage.isEncryptionAvailable())}catch{return false}}
function secureStorageError(){
  const e=new Error('El almacenamiento seguro de Windows no está disponible. VentaNexIA no guardará credenciales ni secretos en texto plano.');
  e.code='SECURE_STORAGE_UNAVAILABLE';
  return e;
}
function hasSecrets(secret){return Boolean(secret&&typeof secret==='object'&&Object.keys(secret).length)}
function snapshot(v){try{return JSON.parse(JSON.stringify(v))}catch{return {}}}
function same(a,b){try{return JSON.stringify(a)===JSON.stringify(b)}catch{return false}}
function isPlainObject(v){return Boolean(v)&&typeof v==='object'&&!Array.isArray(v)}

function normalize(raw={}){
  const locked=raw.secret&&typeof raw.secret==='string'?raw.secret:null;
  let secret={};
  if(typeof raw.secret==='string'){
    if(encryptionOk()){
      try{secret=JSON.parse(safeStorage.decryptString(Buffer.from(raw.secret,'base64')))}
      catch(e){secret={};console.error('state_secret_decrypt_error',String(e?.message||e).slice(0,120))}
    }
  }else if(raw.secret&&typeof raw.secret==='object'){
    secret=raw.secret;
  }
  const out={...raw,secret};
  delete out.__rev;
  out.permissions=raw.permissions||{folders:[]};
  if(!Array.isArray(out.permissions.folders))out.permissions.folders=[];
  out.activity=Array.isArray(raw.activity)?raw.activity:[];
  out.license=raw.license||{};
  out.portals=Array.isArray(raw.portals)?raw.portals:[];
  if(locked&&!Object.keys(secret).length)Object.defineProperty(out,LOCKED,{value:locked,enumerable:false});
  Object.defineProperty(out,REV,{value:Number(raw.__rev||0),writable:true,enumerable:false});
  Object.defineProperty(out,BASE,{value:snapshot(out),writable:true,enumerable:false});
  return out;
}

async function readRaw(file){return JSON.parse(await fs.readFile(file,'utf8'))}

async function readState(){
  const main=storeFile();
  try{return normalize(await readRaw(main))}
  catch(e){
    if(e&&e.code==='ENOENT'){try{return normalize(await readRaw(backupFile()))}catch{return blank()}}
    console.error('state_read_error',String(e?.message||e).slice(0,160));
    try{await fs.rename(main,main+'.corrupt-'+Date.now())}catch{}
    try{const s=normalize(await readRaw(backupFile()));console.error('state_restored_from_backup');return s}catch{return blank()}
  }
}

async function currentRevision(){
  try{return Number((await readRaw(storeFile())).__rev||0)}catch(e){if(e?.code==='ENOENT')return 0;throw e}
}

function mergeThreeWay(base,mine,theirs){
  if(!isPlainObject(mine)||!isPlainObject(theirs))return mine;
  const safeBase=isPlainObject(base)?base:{};
  const out={...theirs};

  for(const key of Object.keys(mine)){
    const b=safeBase[key],m=mine[key],t=theirs[key];
    if(same(m,b)){continue}
    if(same(t,b)){out[key]=m;continue}
    if(isPlainObject(m)&&isPlainObject(t)){out[key]=mergeThreeWay(b,m,t);continue}
    out[key]=m;
  }

  for(const key of Object.keys(safeBase)){
    if(!(key in mine)&&key in out&&same(safeBase[key],theirs[key]))delete out[key];
  }

  return out;
}

function rebaseOnto(mine,fresh){
  const merged=mergeThreeWay(mine[BASE],mine,fresh);
  const locked=mine[LOCKED]||fresh[LOCKED];
  if(locked)Object.defineProperty(merged,LOCKED,{value:locked,enumerable:false});
  Object.defineProperty(merged,REV,{value:Number(fresh[REV]||0),writable:true,enumerable:false});
  Object.defineProperty(merged,BASE,{value:snapshot(fresh),writable:true,enumerable:false});
  return merged;
}

async function writeNow(state,{checkRevision=true}={}){
  const locked=state[LOCKED];
  const expected=Number(state[REV]||0);
  const current=await currentRevision();
  if(checkRevision&&current!==expected){
    const e=new Error('El estado cambió mientras se guardaba.');
    e.code='STATE_CONFLICT';e.expectedRevision=expected;e.currentRevision=current;throw e;
  }

  const out={...state,secret:state.secret||{},__rev:current+1};
  if(encryptionOk()){
    if(locked&&!hasSecrets(out.secret))out.secret=locked;
    else out.secret=Buffer.from(safeStorage.encryptString(JSON.stringify(state.secret||{}))).toString('base64');
  }else{
    if(locked&&!hasSecrets(out.secret))out.secret=locked;
    else if(hasSecrets(out.secret))throw secureStorageError();
    else out.secret={};
  }

  const json=JSON.stringify(out,null,2);
  await fs.mkdir(path.dirname(storeFile()),{recursive:true});
  await fs.writeFile(tmpFile(),json,'utf8');
  try{await fs.copyFile(storeFile(),backupFile())}catch{}
  let lastErr=null;
  for(let i=0;i<6;i++){
    try{
      await fs.rename(tmpFile(),storeFile());
      try{state[REV]=current+1}catch{}
      try{state[BASE]=snapshot(state)}catch{}
      return;
    }catch(e){lastErr=e;await new Promise(r=>setTimeout(r,60*(i+1)))}
  }
  throw lastErr;
}

async function writeWithRebase(state){
  let candidate=state;
  for(let intento=0;intento<=WRITE_RETRIES;intento++){
    try{
      await writeNow(candidate,{checkRevision:true});
      if(candidate!==state){
        for(const key of Object.keys(state))delete state[key];
        Object.assign(state,snapshot(candidate));
        try{state[REV]=candidate[REV];state[BASE]=snapshot(candidate)}catch{}
      }
      return;
    }catch(e){
      if(e?.code!=='STATE_CONFLICT'||intento===WRITE_RETRIES){
        if(e?.code==='STATE_CONFLICT'){
          e.message='No se ha podido guardar: otro proceso está modificando los datos sin parar. Inténtalo de nuevo en unos segundos.';
          console.error('state_conflict_unresolved','reintentos agotados');
        }
        throw e;
      }
      const fresh=await readState();
      candidate=rebaseOnto(candidate,fresh);
      await new Promise(r=>setTimeout(r,40*(intento+1)));
    }
  }
}

let chain=Promise.resolve();
function enqueue(task){const run=chain.then(task,task);chain=run.catch(()=>{});return run}

function writeState(state){return enqueue(()=>writeWithRebase(state))}

function updateState(fn){
  return enqueue(async()=>{
    const s=await readState();
    const r=await fn(s);
    const next=r&&typeof r==='object'?r:s;
    await writeNow(next,{checkRevision:false});
    return next;
  });
}

async function audit(type,detail){
  await updateState(s=>{
    s.activity=[{at:new Date().toISOString(),type,detail},...(s.activity||[])].slice(0,5000);
    return s;
  });
}

module.exports={storeFile,readState,writeState,updateState,audit,encryptionOk};
