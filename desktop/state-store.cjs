'use strict';
const {app,safeStorage}=require('electron');
const path=require('node:path');
const fs=require('node:fs/promises');

const storeFile=()=>path.join(app.getPath('userData'),'secure-state.json');
const backupFile=()=>storeFile()+'.bak';
const tmpFile=()=>storeFile()+'.tmp';
const LOCKED=Symbol.for('vnx.lockedSecret');
const REV=Symbol.for('vnx.stateRevision');

function blank(){const s={permissions:{folders:[]},activity:[],license:{},portals:[],secret:{}};Object.defineProperty(s,REV,{value:0,writable:true,enumerable:false});return s}
function encryptionOk(){try{return Boolean(safeStorage.isEncryptionAvailable())}catch{return false}}
function secureStorageError(){
  const e=new Error('El almacenamiento seguro de Windows no está disponible. VentaNexIA no guardará credenciales ni secretos en texto plano.');
  e.code='SECURE_STORAGE_UNAVAILABLE';
  return e;
}
function hasSecrets(secret){return Boolean(secret&&typeof secret==='object'&&Object.keys(secret).length)}

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

async function writeNow(state,{checkRevision=true}={}){
  const locked=state[LOCKED];
  const expected=Number(state[REV]||0);
  const current=await currentRevision();
  if(checkRevision&&current!==expected){
    const e=new Error('El estado cambió mientras se guardaba. Repite la operación para evitar perder datos.');
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
      return;
    }catch(e){lastErr=e;await new Promise(r=>setTimeout(r,60*(i+1)))}
  }
  throw lastErr;
}

let chain=Promise.resolve();
function enqueue(task){const run=chain.then(task,task);chain=run.catch(()=>{});return run}
function writeState(state){return enqueue(()=>writeNow(state,{checkRevision:true}))}
function updateState(fn){return enqueue(async()=>{const s=await readState();const r=await fn(s);const next=r&&typeof r==='object'?r:s;await writeNow(next,{checkRevision:false});return next})}
async function audit(type,detail){await updateState(s=>{s.activity=[{at:new Date().toISOString(),type,detail},...(s.activity||[])].slice(0,5000);return s})}

module.exports={storeFile,readState,writeState,updateState,audit,encryptionOk};
