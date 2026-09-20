'use strict';
const {app,safeStorage}=require('electron');
const path=require('node:path');
const fs=require('node:fs/promises');

const storeFile=()=>path.join(app.getPath('userData'),'secure-state.json');
const backupFile=()=>storeFile()+'.bak';
const tmpFile=()=>storeFile()+'.tmp';
const LOCKED=Symbol.for('vnx.lockedSecret');

function blank(){return {permissions:{folders:[]},activity:[],license:{},portals:[],secret:{}}}
function encryptionOk(){try{return safeStorage.isEncryptionAvailable()}catch{return false}}

function normalize(raw){
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
  out.permissions=raw.permissions||{folders:[]};
  if(!Array.isArray(out.permissions.folders))out.permissions.folders=[];
  out.activity=Array.isArray(raw.activity)?raw.activity:[];
  out.license=raw.license||{};
  out.portals=Array.isArray(raw.portals)?raw.portals:[];
  if(locked&&!Object.keys(secret).length)Object.defineProperty(out,LOCKED,{value:locked,enumerable:false});
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

async function writeNow(state){
  const out={...state,secret:state.secret||{}};
  if(encryptionOk()){
    const locked=state[LOCKED];
    if(locked&&!Object.keys(out.secret).length)out.secret=locked;
    else out.secret=Buffer.from(safeStorage.encryptString(JSON.stringify(state.secret||{}))).toString('base64');
  }
  const json=JSON.stringify(out,null,2);
  await fs.mkdir(path.dirname(storeFile()),{recursive:true});
  await fs.writeFile(tmpFile(),json,'utf8');
  try{await fs.copyFile(storeFile(),backupFile())}catch{}
  let lastErr=null;
  for(let i=0;i<6;i++){
    try{await fs.rename(tmpFile(),storeFile());return}
    catch(e){lastErr=e;await new Promise(r=>setTimeout(r,60*(i+1)))}
  }
  throw lastErr;
}

let chain=Promise.resolve();
function enqueue(task){const run=chain.then(task,task);chain=run.catch(()=>{});return run}
function writeState(state){return enqueue(()=>writeNow(state))}
function updateState(fn){return enqueue(async()=>{const s=await readState();const r=await fn(s);const next=r&&typeof r==='object'?r:s;await writeNow(next);return next})}
async function audit(type,detail){await updateState(s=>{s.activity=[{at:new Date().toISOString(),type,detail},...(s.activity||[])].slice(0,5000);return s})}

module.exports={storeFile,readState,writeState,updateState,audit};
