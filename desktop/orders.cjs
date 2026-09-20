'use strict';
// Conexión del agente de Pedidos con Electron. La lógica está en orders-core.cjs; aquí solo están los adaptadores:
//  - correo: Gmail (API oficial, con renovación automática) y cualquier correo IMAP/SMTP (Yahoo, iCloud, hosting, empresa…)
//  - IA: /api/orders-extract del servidor de VentaNexIA (solo EXTRAE datos; las decisiones las toma orders-core)
//  - destino: archivo, webhook (en el núcleo) y borradores de pedido en Shopify (aquí)
const {app,dialog,Notification,BrowserWindow}=require('electron');
const fs=require('node:fs/promises');
const path=require('node:path');
const {readState,audit}=require('./state-store.cjs');
const {gmailCall}=require('./gmail-auth.cjs');
const {shopifyCall}=require('./shopify-auth.cjs');
const files=require('./order-files.cjs');
const {createOrders}=require('./orders-core.cjs');
const policy=require('./agent-policy.cjs');

const CLOUD='https://www.ventanexia.es';
const GMAIL='https://gmail.googleapis.com/gmail/v1/users/me/';
const MAX_ATT=8*1024*1024;
const deps={ImapFlow:null,nodemailer:null,simpleParser:null};
function lib(name){
  if(deps[name])return deps[name];
  if(name==='ImapFlow')return (deps.ImapFlow=require('imapflow').ImapFlow);
  if(name==='nodemailer')return (deps.nodemailer=require('nodemailer'));
  if(name==='simpleParser')return (deps.simpleParser=require('mailparser').simpleParser);
}
let instance=null,timer=null;

const emailOf=v=>{const m=String(v||'').match(/[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,10}/i);return m?m[0].toLowerCase():''};
const cut=(s,n)=>{s=String(s||'');return s.length>n?s.slice(0,n-1)+'…':s};

async function mailAccounts(){
  const s=await readState();const seen=new Set(),out=[];
  for(const x of [...(s.secret?.emailAccounts||[]),s.secret?.integrations?.email].filter(Boolean)){
    const address=String(x.meta?.email||x.genericMail?.email||x.label||x.account||'').trim().toLowerCase();
    if(!address||seen.has(address))continue;
    if(x.provider==='gmail'){seen.add(address);out.push({address,kind:'gmail',integration:x})}
    else if(x.genericMail?.imapHost&&x.genericMail?.smtpHost){seen.add(address);out.push({address,kind:'imap',integration:x,cfg:x.genericMail})}
  }
  return out;
}

async function gfetch(acc,pq,{method='GET',body=null}={}){
  return gmailCall(acc.integration,async token=>{
    const r=await fetch(GMAIL+pq,{method,headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
    const txt=await r.text();let j={};try{j=txt?JSON.parse(txt):{}}catch{}
    if(!r.ok){const e=new Error(j?.error?.message||('Gmail respondió '+r.status));e.status=r.status;throw e}
    return j;
  });
}
const hdr=(payload,name)=>((payload?.headers||[]).find(h=>String(h.name).toLowerCase()===name)||{}).value||'';
function b64u(data=''){return Buffer.from(String(data).replace(/-/g,'+').replace(/_/g,'/'),'base64')}
function walkParts(payload,cb){if(!payload)return;cb(payload);for(const p of payload.parts||[])walkParts(p,cb)}
function attachmentNamesOf(payload){const n=[];walkParts(payload,p=>{if(p.filename)n.push(p.filename)});return n}
const PART_FIELDS='mimeType,filename,body/size';
const META_FIELDS='id,threadId,snippet,labelIds,internalDate,payload(mimeType,headers,filename,body/size,parts('+PART_FIELDS+',parts('+PART_FIELDS+',parts('+PART_FIELDS+'))))';
async function gmailMessageToFull(acc,m){
  let text='',html='';const atts=[];
  const parts=[];walkParts(m.payload,p=>parts.push(p));
  for(const p of parts){
    if(p.filename&&p.body?.attachmentId){
      const size=Number(p.body.size||0);
      if(files.isReadable(p.filename,p.mimeType)&&size<=MAX_ATT){
        try{const a=await gfetch(acc,'messages/'+encodeURIComponent(m.id)+'/attachments/'+encodeURIComponent(p.body.attachmentId));atts.push({name:p.filename,mime:p.mimeType,buffer:b64u(a.data)})}catch{atts.push({name:p.filename,mime:p.mimeType,buffer:null})}
      }else atts.push({name:p.filename,mime:p.mimeType,buffer:null});
    }else if(p.mimeType==='text/plain'&&p.body?.data&&!p.filename)text+=b64u(p.body.data).toString('utf8')+'\n';
    else if(p.mimeType==='text/html'&&p.body?.data&&!p.filename)html+=b64u(p.body.data).toString('utf8')+'\n';
  }
  const from=hdr(m.payload,'from');
  return {id:m.id,threadId:m.threadId,from,fromEmail:emailOf(from),to:hdr(m.payload,'to'),subject:hdr(m.payload,'subject'),date:hdr(m.payload,'date'),messageIdHeader:hdr(m.payload,'message-id')||null,
    text:(text.trim()||files.stripHtml(html)),attachments:atts,internalDate:Number(m.internalDate||0)};
}
function mimeHeader(v=''){const t=String(v).replace(/[\r\n]+/g,' ');return /^[\x20-\x7e]*$/.test(t)?t:'=?UTF-8?B?'+Buffer.from(t,'utf8').toString('base64')+'?='}
function buildRaw({from,to,subject,body,inReplyTo,references}){
  const h=['From: '+from,'To: '+to,'Subject: '+mimeHeader(subject),'MIME-Version: 1.0','Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64',inReplyTo?'In-Reply-To: '+inReplyTo:null,references?'References: '+references:null].filter(Boolean);
  const b64=Buffer.from(body,'utf8').toString('base64').replace(/(.{76})/g,'$1\r\n');
  return Buffer.from(h.join('\r\n')+'\r\n\r\n'+b64,'utf8').toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
const gmailAdapter={
  async listRecent(acc,{sinceMs,max}){
    const days=Math.max(1,Math.ceil((Date.now()-sinceMs)/86400e3));
    const list=await gfetch(acc,'messages?maxResults='+Math.min(max,100)+'&q='+encodeURIComponent('in:inbox newer_than:'+days+'d'));
    const ids=(list.messages||[]).map(x=>x.id);const out=[];
    for(let i=0;i<ids.length;i+=6){
      const chunk=await Promise.all(ids.slice(i,i+6).map(id=>gfetch(acc,'messages/'+encodeURIComponent(id)+'?format=full&fields='+encodeURIComponent(META_FIELDS)).catch(()=>null)));
      for(const m of chunk){if(!m)continue;const from=hdr(m.payload,'from');
        out.push({id:m.id,threadId:m.threadId,from,fromEmail:emailOf(from),subject:hdr(m.payload,'subject'),date:hdr(m.payload,'date'),snippet:String(m.snippet||''),attachmentNames:attachmentNamesOf(m.payload),listUnsubscribe:Boolean(hdr(m.payload,'list-unsubscribe'))})}
    }
    return out;
  },
  async fetchFull(acc,id){return gmailMessageToFull(acc,await gfetch(acc,'messages/'+encodeURIComponent(id)+'?format=full'))},
  async send(acc,{to,subject,body,threadId,inReplyTo}){
    const raw=buildRaw({from:acc.address,to,subject,body,inReplyTo,references:inReplyTo});
    const r=await gfetch(acc,'messages/send',{method:'POST',body:threadId?{raw,threadId}:{raw}});
    let header=null;try{header=hdr((await gfetch(acc,'messages/'+encodeURIComponent(r.id)+'?format=metadata&metadataHeaders=Message-ID')).payload,'message-id')||null}catch{}
    return {id:r.id,threadId:r.threadId,messageIdHeader:header};
  },
  async listReplies(acc,{threadId,afterMs}){
    if(!threadId)return [];
    const t=await gfetch(acc,'threads/'+encodeURIComponent(threadId)+'?format=full');
    const out=[];
    for(const m of t.messages||[]){
      if(Number(m.internalDate||0)<=afterMs)continue;
      const full=await gmailMessageToFull(acc,m);if(full.fromEmail&&full.fromEmail!==acc.address)out.push(full);
    }
    return out;
  }
};

function imapClient(acc){
  const c=acc.cfg;const ImapFlow=lib('ImapFlow');
  return new ImapFlow({host:c.imapHost,port:Number(c.imapPort||993),secure:Number(c.imapPort||993)===993,auth:{user:c.username||c.email,pass:c.password},logger:false});
}
async function withImap(acc,fn){
  const client=imapClient(acc);await client.connect();
  const lock=await client.getMailboxLock('INBOX');
  try{return await fn(client)}finally{try{lock.release()}catch{};try{await client.logout()}catch{}}
}
function structNames(node,out=[]){
  if(!node)return out;
  const n=node.dispositionParameters?.filename||node.parameters?.name;if(n)out.push(String(n));
  for(const c of node.childNodes||[])structNames(c,out);return out;
}
async function parsedToFull(acc,uid,source){
  const p=await lib('simpleParser')(source);
  const from=p.from?.text||'';const fe=(p.from?.value?.[0]?.address||emailOf(from)).toLowerCase();
  const atts=(p.attachments||[]).filter(a=>a.filename).map(a=>({name:a.filename,mime:a.contentType,buffer:files.isReadable(a.filename,a.contentType)&&a.size<=MAX_ATT?a.content:null}));
  const refs=Array.isArray(p.references)?p.references:(p.references?[p.references]:[]);
  return {id:String(uid),threadId:refs[0]||p.messageId||String(uid),from,fromEmail:fe,to:p.to?.text||'',subject:p.subject||'',date:p.date?p.date.toUTCString():'',messageIdHeader:p.messageId||null,
    text:(p.text&&p.text.trim())||files.stripHtml(p.html||''),attachments:atts,internalDate:p.date?p.date.getTime():0};
}
const imapAdapter={
  async listRecent(acc,{sinceMs,max}){
    return withImap(acc,async client=>{
      const uids=(await client.search({since:new Date(sinceMs)},{uid:true}))||[];const pick=uids.slice(-max);const out=[];
      if(!pick.length)return out;
      for await(const m of client.fetch(pick,{uid:true,envelope:true,bodyStructure:true,headers:['list-unsubscribe']},{uid:true})){
        const from=m.envelope?.from?.[0];const fromEmail=String(from?.address||'').toLowerCase();
        out.push({id:String(m.uid),threadId:null,from:(from?.name?from.name+' <'+fromEmail+'>':fromEmail),fromEmail,subject:m.envelope?.subject||'',date:m.envelope?.date?new Date(m.envelope.date).toUTCString():'',snippet:'',
          attachmentNames:structNames(m.bodyStructure),listUnsubscribe:/list-unsubscribe/i.test(String(m.headers||''))});
      }
      return out;
    });
  },
  async fetchFull(acc,id){return withImap(acc,async client=>{const m=await client.fetchOne(String(id),{source:true},{uid:true});return parsedToFull(acc,id,m.source)})},
  async send(acc,{to,subject,body,inReplyTo}){
    const c=acc.cfg;const port=Number(c.smtpPort||465);
    const tr=lib('nodemailer').createTransport({host:c.smtpHost,port,secure:port===465,requireTLS:port!==465,auth:{user:c.username||c.email,pass:c.password}});
    const info=await tr.sendMail({from:acc.address,to,subject,text:body,...(inReplyTo?{inReplyTo,references:inReplyTo}:{})});
    return {id:info.messageId,threadId:inReplyTo||info.messageId,messageIdHeader:info.messageId};
  },
  async listReplies(acc,{fromEmail,afterMs}){
    return withImap(acc,async client=>{
      const uids=(await client.search({since:new Date(afterMs),from:fromEmail},{uid:true}))||[];const out=[];
      for(const uid of uids.slice(-5)){const m=await client.fetchOne(String(uid),{source:true},{uid:true});const f=await parsedToFull(acc,uid,m.source);if(f.internalDate>afterMs)out.push(f)}
      return out;
    });
  }
};
const adapterFor=acc=>acc.kind==='gmail'?gmailAdapter:imapAdapter;
const mail={
  accounts:mailAccounts,
  listRecent:(acc,o)=>adapterFor(acc).listRecent(acc,o),fetchFull:(acc,id)=>adapterFor(acc).fetchFull(acc,id),
  send:(acc,o)=>adapterFor(acc).send(acc,o),listReplies:(acc,o)=>adapterFor(acc).listReplies(acc,o)
};

async function extract(payload){
  const s=await readState();
  const ac=new AbortController();const t=setTimeout(()=>ac.abort(),90000);
  try{
    const r=await fetch(CLOUD+'/api/orders-extract',{method:'POST',signal:ac.signal,headers:{'Content-Type':'application/json','User-Agent':'VentaNexIA-Desktop/'+app.getVersion()},
      body:JSON.stringify({...payload,desktop:{customerId:s.secret?.customerId||null,deviceId:s.license?.deviceId||null,activationCode:s.secret?.activationCode||null,deviceKey:s.secret?.deviceKey||null}})});
    const j=await r.json().catch(()=>({}));
    if(!r.ok||!j.ok)throw new Error(j.error||('La lectura con IA respondió '+r.status));
    return j.result;
  }finally{clearTimeout(t)}
}

async function shopGql(query,variables={}){
  const s=await readState();const cfg=s.secret?.integrations?.shopify;
  if(!cfg?.shop)throw new Error('Shopify no está conectado');
  return shopifyCall(cfg,async token=>{
    const r=await fetch('https://'+cfg.shop+'/admin/api/2026-07/graphql.json',{method:'POST',headers:{'Content-Type':'application/json','X-Shopify-Access-Token':token},body:JSON.stringify({query,variables})});
    const j=await r.json().catch(()=>({}));
    if(!r.ok||j.errors){const e=new Error((typeof j.errors==='string'?j.errors:j.errors?.[0]?.message)||('Shopify respondió '+r.status));e.status=r.status;throw e}
    return j.data;
  });
}
async function shopifyCustomers(){
  const rows=[['Código','Razón social','CIF/NIF','Email','Teléfono','Dirección']];let after=null;
  for(let i=0;i<4;i++){
    const d=await shopGql('query($after:String){customers(first:250,after:$after){pageInfo{hasNextPage endCursor}nodes{id displayName email phone defaultAddress{company address1 city zip}}}}',{after});
    for(const c of d.customers.nodes)rows.push([c.id.split('/').pop(),c.defaultAddress?.company||c.displayName||'','',c.email||'',c.phone||'',[c.defaultAddress?.address1,c.defaultAddress?.zip,c.defaultAddress?.city].filter(Boolean).join(', ')]);
    if(!d.customers.pageInfo.hasNextPage)break;after=d.customers.pageInfo.endCursor;
  }
  return rows;
}
async function shopifyCatalog(){
  const rows=[['Referencia','Descripción','Precio']];let after=null;
  for(let i=0;i<6;i++){
    const d=await shopGql('query($after:String){productVariants(first:250,after:$after){pageInfo{hasNextPage endCursor}nodes{sku displayName price}}}',{after});
    for(const v of d.productVariants.nodes)if(v.sku)rows.push([v.sku,v.displayName||'',v.price||'']);
    if(!d.productVariants.pageInfo.hasNextPage)break;after=d.productVariants.pageInfo.endCursor;
  }
  return rows;
}
async function shopifyDraft(order){
  if(order.source?.kind==='shopify')throw new Error('Este pedido ya está en Shopify: no hace falta crear un borrador');
  const ex=order.extracted;const items=[];
  for(const l of ex.lines){
    let variantId=null;
    if(l.ref){const d=await shopGql('query($q:String!){productVariants(first:1,query:$q){nodes{id sku}}}',{q:'sku:'+JSON.stringify(String(l.ref))});variantId=d.productVariants.nodes[0]?.id||null}
    items.push(variantId?{variantId,quantity:Math.round(l.qty)}:{title:l.description||l.ref||'Artículo',quantity:Math.round(l.qty),originalUnitPriceWithCurrency:{amount:String(l.price??0),currencyCode:'EUR'}});
  }
  const c=ex.customer;
  const input={lineItems:items,note:'Pedido '+(ex.orderRef||'')+' recibido por email de '+(order.source.from||'')+' · VentaNexIA '+order.id,tags:['VentaNexIA','pedido-email'],email:c.email||order.source.fromEmail||undefined};
  const d=await shopGql('mutation($input:DraftOrderInput!){draftOrderCreate(input:$input){draftOrder{id name}userErrors{field message}}}',{input});
  const er=d.draftOrderCreate.userErrors;
  if(er&&er.length)throw new Error('Shopify: '+er.map(e=>e.message).join('; '));
  return {ok:true,type:'shopify_draft',path:d.draftOrderCreate.draftOrder.name,id:d.draftOrderCreate.draftOrder.id};
}

async function shopifyWebOrders({sinceMs}){
  const s=await readState();const cfg=s.secret?.integrations?.shopify;if(!cfg?.shop)return [];
  const day=new Date(sinceMs).toISOString().slice(0,10);
  const addr=a=>a?[a.company,a.name,a.address1,[a.zip,a.city].filter(Boolean).join(' ')].filter(Boolean).join(', '):null;
  const d=await shopGql('query($q:String!){orders(first:50,query:$q,sortKey:CREATED_AT,reverse:true){nodes{id name createdAt email phone note currentTotalPriceSet{shopMoney{amount currencyCode}} customer{displayName} shippingAddress{company name address1 zip city phone} billingAddress{company name address1 zip city} lineItems(first:100){nodes{sku title quantity originalUnitPriceSet{shopMoney{amount}}}}}}}',{q:'created_at:>='+day});
  return (d.orders?.nodes||[]).map(o=>({id:o.id,account:cfg.shop,name:o.name,createdAt:o.createdAt,email:o.email||'',phone:o.phone||o.shippingAddress?.phone||'',note:o.note||'',customerName:o.customer?.displayName||o.shippingAddress?.name||'',company:o.billingAddress?.company||o.shippingAddress?.company||'',
    shippingAddress:addr(o.shippingAddress),billingAddress:addr(o.billingAddress),currency:o.currentTotalPriceSet?.shopMoney?.currencyCode||'EUR',total:Number(o.currentTotalPriceSet?.shopMoney?.amount)||null,
    lines:(o.lineItems?.nodes||[]).map(l=>({sku:l.sku||'',title:l.title||'',qty:l.quantity,price:Number(l.originalUnitPriceSet?.shopMoney?.amount)||null}))}));
}

async function loadList(kind,src){
  if(!src)return null;
  if(src.type==='file'){const b=await fs.readFile(src.path);return files.readTableBuffer(path.basename(src.path),b)}
  if(src.type==='shopify')return kind==='customers'?shopifyCustomers():shopifyCatalog();
  return null;
}

const win=()=>BrowserWindow.getAllWindows()[0]||null;
async function confirm(o){const r=await dialog.showMessageBox(win(),{type:'question',buttons:['Continuar','Cancelar'],defaultId:1,cancelId:1,noLink:true,title:o.title,message:o.message,detail:o.detail});return r.response===0}
async function pickFolder(){const r=await dialog.showOpenDialog(win(),{title:'Carpeta donde dejar los pedidos',properties:['openDirectory','createDirectory']});return r.canceled?null:r.filePaths[0]}
async function pickFile(){const r=await dialog.showOpenDialog(win(),{title:'Archivo exportado de tu programa (Excel o CSV)',properties:['openFile'],filters:[{name:'Excel o CSV',extensions:['xlsx','csv','txt']}]});return r.canceled?null:r.filePaths[0]}
const notify=(title,body)=>{try{if(Notification.isSupported())new Notification({title,body}).show()}catch{}};

async function monthlyLimit(){
  const s=await readState();
  if(policy.isMaster&&policy.isMaster(s.license))return null;
  return policy.orderMonthlyLimit?(policy.orderMonthlyLimit(s.license)||100):100;
}
function get(){
  if(instance)return instance;
  instance=createOrders({dir:path.join(app.getPath('userData'),'orders'),mail,extract,files:{extract:files.extractText},webOrders:shopifyWebOrders,monthlyLimit,confirm,notify,audit,loadList,fetch:(...a)=>fetch(...a),pickFolder,pickFile,
    deliverers:{shopify_draft:shopifyDraft}});
  return instance;
}
async function handleChat(text){return get().handleChat(text)}
function startScheduler(){
  if(timer)return;
  const tick=()=>get().tick().catch(e=>console.error('orders_tick_error',String(e?.message||e).slice(0,160)));
  const first=setTimeout(tick,2*60*1000);first.unref?.();
  timer=setInterval(tick,15*60*1000);timer.unref?.();
}
module.exports={handleChat,startScheduler,_get:get,_deps:deps,_adapters:{gmailAdapter,imapAdapter},_shopify:{shopifyDraft,shopifyCustomers,shopifyCatalog,shopifyWebOrders}};
