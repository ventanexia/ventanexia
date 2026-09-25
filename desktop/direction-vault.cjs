'use strict';
const {app}=require('electron');
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');

const FORMAT='VNX-DIRECTION-1';
const ITERATIONS=310000;
const AAD=Buffer.from('VentaNexIA|Direccion|v1','utf8');

const vaultDir=()=>path.join(app.getPath('documents'),'VentaNexIA','Direccion');
const vaultFile=()=>path.join(vaultDir(),'direccion.vnxdir');
const backupFile=()=>vaultFile()+'.bak';
const tmpFile=()=>vaultFile()+'.tmp';

function b64(v){return Buffer.from(v).toString('base64')}
function from64(v){return Buffer.from(String(v||''),'base64')}
function deriveKey(pin,deviceSecret,salt){
  if(!/^\d{4}$/.test(String(pin||'')))throw new Error('PIN de Dirección no válido.');
  if(!String(deviceSecret||'').trim())throw new Error('Falta la clave local del archivo de Dirección.');
  return crypto.pbkdf2Sync(String(pin)+'|'+String(deviceSecret),salt,ITERATIONS,32,'sha256');
}
function encryptWithKey(data,key,salt){
  const iv=crypto.randomBytes(12);
  const cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
  cipher.setAAD(AAD);
  const plain=Buffer.from(JSON.stringify(data||{}),'utf8');
  const ciphertext=Buffer.concat([cipher.update(plain),cipher.final()]);
  const tag=cipher.getAuthTag();
  return {format:FORMAT,kdf:'PBKDF2-SHA256',iterations:ITERATIONS,salt:b64(salt),iv:b64(iv),tag:b64(tag),ciphertext:b64(ciphertext),updatedAt:new Date().toISOString()};
}
function decryptWithKey(doc,key){
  if(!doc||doc.format!==FORMAT)throw new Error('El archivo privado de Dirección no tiene un formato válido.');
  const decipher=crypto.createDecipheriv('aes-256-gcm',key,from64(doc.iv));
  decipher.setAAD(AAD);
  decipher.setAuthTag(from64(doc.tag));
  const plain=Buffer.concat([decipher.update(from64(doc.ciphertext)),decipher.final()]).toString('utf8');
  return JSON.parse(plain);
}
async function readDoc(){
  try{return JSON.parse(await fs.readFile(vaultFile(),'utf8'))}
  catch(e){
    if(e?.code==='ENOENT')return null;
    try{return JSON.parse(await fs.readFile(backupFile(),'utf8'))}catch{throw e}
  }
}
async function writeDoc(doc){
  await fs.mkdir(vaultDir(),{recursive:true});
  await fs.writeFile(tmpFile(),JSON.stringify(doc,null,2),'utf8');
  try{await fs.copyFile(vaultFile(),backupFile())}catch{}
  await fs.rename(tmpFile(),vaultFile());
}
async function exists(){try{await fs.access(vaultFile());return true}catch{return false}}
async function create(pin,deviceSecret,data={}){
  const salt=crypto.randomBytes(24),key=deriveKey(pin,deviceSecret,salt);
  await writeDoc(encryptWithKey(data,key,salt));
  return {key,path:vaultFile()};
}
async function open(pin,deviceSecret){
  const doc=await readDoc();if(!doc)throw new Error('El archivo privado de Dirección todavía no existe.');
  const salt=from64(doc.salt),key=deriveKey(pin,deviceSecret,salt);
  try{return {data:decryptWithKey(doc,key),key,path:vaultFile()}}
  catch{const e=new Error('PIN de Dirección incorrecto o archivo privado no accesible.');e.code='DIRECTION_PIN_INVALID';throw e}
}
async function readWithKey(key){
  const doc=await readDoc();if(!doc)throw new Error('No existe el archivo privado de Dirección.');
  try{return decryptWithKey(doc,key)}
  catch{const e=new Error('La sesión de Dirección ya no puede abrir el archivo privado.');e.code='DIRECTION_VAULT_LOCKED';throw e}
}
async function writeWithKey(key,data){
  const doc=await readDoc();if(!doc)throw new Error('No existe el archivo privado de Dirección.');
  const salt=from64(doc.salt);
  // Validate key against current file before replacing it.
  decryptWithKey(doc,key);
  await writeDoc(encryptWithKey(data,key,salt));
  return {ok:true,path:vaultFile()};
}
async function changePin(currentPin,newPin,deviceSecret){
  const opened=await open(currentPin,deviceSecret);
  return create(newPin,deviceSecret,opened.data);
}
async function info(){
  const doc=await readDoc();
  return {exists:Boolean(doc),path:vaultFile(),format:doc?.format||null,updatedAt:doc?.updatedAt||null};
}

module.exports={FORMAT,ITERATIONS,vaultDir,vaultFile,exists,create,open,readWithKey,writeWithKey,changePin,info};
