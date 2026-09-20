'use strict';
const {safeStorage}=require('electron');
const crypto=require('node:crypto');
const {readState,writeState,audit}=require('./state-store.cjs');
const {ownAgentLimit,isMaster}=require('./agent-policy.cjs');

function clean(v,n=500){return String(v==null?'':v).trim().slice(0,n)}
function id(){return crypto.randomUUID()}
function secureUrl(v){
  let u;try{u=new URL(String(v||'').trim())}catch{throw new Error('La dirección del agente no es válida')}
  if(u.protocol!=='https:')throw new Error('Por seguridad, la dirección del agente debe empezar por https://');
  return u.toString().replace(/\/$/,'');
}
function listFromState(s){
  const raw=Array.isArray(s.secret?.externalAgents)?s.secret.externalAgents:[];
  return raw.map(x=>({id:x.id,name:x.name,protocol:x.protocol,url:x.url,tool:x.tool||'',permissions:x.permissions||'prepare',connectedAt:x.connectedAt||null,status:x.status||'connected'}));
}
async function list(){return listFromState(await readState())}
function authHeaders(x){return x.token?{Authorization:'Bearer '+x.token}:{}}
async function readJsonResponse(r){
  const text=await r.text();
  if((r.headers.get('content-type')||'').includes('text/event-stream')){
    const data=text.split(/\r?\n/).filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trim()).filter(Boolean).filter(l=>l!=='[DONE]');
    for(let i=data.length-1;i>=0;i--){try{return JSON.parse(data[i])}catch{}}
    return {raw:text};
  }
  try{return text?JSON.parse(text):{}}catch{return {raw:text}}
}
async function post(x,body,timeout=25000){
  const ac=new AbortController(),t=setTimeout(()=>ac.abort(),timeout);
  try{
    const r=await fetch(x.url,{method:'POST',signal:ac.signal,headers:{'Content-Type':'application/json','Accept':'application/json, text/event-stream',...authHeaders(x)},body:JSON.stringify(body)});
    const j=await readJsonResponse(r);
    if(!r.ok)throw new Error(j?.error?.message||j?.message||('El agente respondió '+r.status));
    return j;
  }catch(e){if(e.name==='AbortError')throw new Error('El agente tarda demasiado en responder');throw e}
  finally{clearTimeout(t)}
}
async function mcpRequest(x,method,params,idValue){
  const j=await post(x,{jsonrpc:'2.0',id:idValue||Date.now(),method,params});
  if(j?.error)throw new Error(j.error.message||'Error MCP');
  return j.result;
}
async function test(payload){
  const protocol=clean(payload.protocol,20).toLowerCase(),x={url:secureUrl(payload.url),token:clean(payload.token,4096),protocol};
  if(protocol==='mcp'){
    await mcpRequest(x,'initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'VentaNexIA',version:'0.6.64'}},1);
    const tools=await mcpRequest(x,'tools/list',{},2);
    return {ok:true,tools:(tools?.tools||[]).slice(0,50).map(t=>({name:t.name,description:t.description||'',inputSchema:t.inputSchema||{}}))};
  }
  const j=await post(x,{action:'ping',source:'VentaNexIA',message:'Prueba de conexión. Responde con OK sin ejecutar ninguna acción externa.'});
  return {ok:true,preview:clean(j.reply||j.message||j.output||j.result||j.raw||'Conexión correcta',300)};
}
async function save(payload){
  if(!safeStorage?.isEncryptionAvailable?.())throw new Error('Este equipo no tiene disponible el cifrado seguro del sistema. No guardaré claves sin cifrar.');
  const s=await readState();s.secret=s.secret||{};s.secret.externalAgents=Array.isArray(s.secret.externalAgents)?s.secret.externalAgents:[];
  const existing=s.secret.externalAgents.find(x=>x.id===payload.id);
  const limit=ownAgentLimit(s.license);
  if(!existing&&!isMaster(s.license)&&s.secret.externalAgents.length>=limit)throw new Error('Has usado todas las plazas de agentes propios contratadas. Añade otro agente propio en tu plan antes de conectarlo.');
  const protocol=clean(payload.protocol,20).toLowerCase();
  if(!['api','webhook','mcp'].includes(protocol))throw new Error('Tipo de conexión no compatible');
  const name=clean(payload.name,80);if(!name)throw new Error('Pon un nombre al agente');
  const url=secureUrl(payload.url),token=clean(payload.token||existing?.token,4096);
  const tool=clean(payload.tool||existing?.tool,120),permissions=['read','prepare','approve'].includes(payload.permissions)?payload.permissions:'prepare';
  const probe=await test({protocol,url,token});
  if(protocol==='mcp'&&!tool){
    if((probe.tools||[]).length===1)payload.tool=probe.tools[0].name;
    else throw new Error('El servidor MCP tiene varias herramientas. Elige cuál representa a este agente.');
  }
  const rec={id:existing?.id||id(),name,protocol,url,token,tool:clean(payload.tool||tool,120),permissions,connectedAt:new Date().toISOString(),status:'connected'};
  if(existing)Object.assign(existing,rec);else s.secret.externalAgents.push(rec);
  await writeState(s);await audit('external_agent.connected',name+' · '+protocol);
  return {...rec,token:undefined,tools:probe.tools||[]};
}
async function remove(agentId){
  const s=await readState(),before=(s.secret?.externalAgents||[]).length;
  if(s.secret?.externalAgents)s.secret.externalAgents=s.secret.externalAgents.filter(x=>x.id!==agentId);
  await writeState(s);if(before!==(s.secret?.externalAgents||[]).length)await audit('external_agent.disconnected',agentId);return true;
}
function chooseMcpArgs(tool,prompt,messages){
  const schema=tool?.inputSchema||{},props=schema.properties||{},args={};
  const candidates=['prompt','query','input','message','text','question','task'];
  const key=candidates.find(k=>props[k])||Object.keys(props).find(k=>props[k]?.type==='string');
  if(key)args[key]=prompt;
  const mk=Object.keys(props).find(k=>/messages/i.test(k)&&props[k]?.type==='array');if(mk)args[mk]=messages.slice(-12);
  return args;
}
async function chat(agentId,messages=[]){
  const s=await readState(),x=(s.secret?.externalAgents||[]).find(a=>a.id===agentId);
  if(!x)throw new Error('Este agente propio ya no está conectado.');
  const prompt=String([...messages].reverse().find(m=>m?.role==='user')?.content||'').trim();
  if(x.protocol==='mcp'){
    await mcpRequest(x,'initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'VentaNexIA',version:'0.6.64'}},1).catch(()=>{});
    const tools=await mcpRequest(x,'tools/list',{},2),tool=(tools?.tools||[]).find(t=>t.name===x.tool);
    if(!tool)throw new Error('La herramienta MCP configurada ya no está disponible.');
    const result=await mcpRequest(x,'tools/call',{name:x.tool,arguments:chooseMcpArgs(tool,prompt,messages)},3);
    const reply=(result?.content||[]).map(v=>v?.text||v?.json&&JSON.stringify(v.json)||'').filter(Boolean).join('\n')||JSON.stringify(result||{});
    await audit('external_agent.chat',x.name+' · MCP');return {reply,source:'external-agent',route:'external:'+x.id};
  }
  const j=await post(x,{messages:messages.slice(-20),prompt,source:'VentaNexIA',permissions:x.permissions});
  const reply=j.reply||j.message||j.output||j.result||j.data?.reply||j.raw;
  if(!reply)throw new Error('El agente respondió, pero no encuentro texto utilizable en su respuesta.');
  await audit('external_agent.chat',x.name+' · '+x.protocol);return {reply:typeof reply==='string'?reply:JSON.stringify(reply,null,2),source:'external-agent',route:'external:'+x.id};
}
module.exports={list,test,save,remove,chat};
