'use strict';
// Conexión del agente de Pedidos con Electron. La lógica está en orders-core.cjs; aquí solo están los adaptadores:
//  - correo: Gmail (API oficial, con renovación automática) y cualquier correo IMAP/SMTP (Yahoo, iCloud, hosting, empresa…)
//  - IA: /api/orders-extract del servidor de VentaNexIA (solo EXTRAE datos; las decisiones las toma orders-core)
//  - destino: archivo, webhook (en el núcleo) y borradores de pedido en Shopify (aquí)
const {app,dialog,Notification,BrowserWindow,safeStorage}=require('electron');
const fs=require('node:fs/promises');
const path=require('node:path');
const {readState,writeState,audit}=require('./state-store.cjs');
const {gmailCall,gmailFetch}=require('./gmail-auth.cjs');
const {shopifyCall}=require('./shopify-auth.cjs');
const files=require('./order-files.cjs');
const {createOrders}=require('./orders-core.cjs');
const policy=require('./agent-policy.cjs');
const connectors=require('./erp.cjs');

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
    const r=await gmailFetch(GMAIL+pq,{method,headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
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
  const rows=[['Referencia','Descripción','Precio','Stock']];let after=null;
  for(let i=0;i<6;i++){
    const d=await shopGql('query($after:String){productVariants(first:250,after:$after){pageInfo{hasNextPage endCursor}nodes{sku displayName price inventoryQuantity}}}',{after});
    for(const v of d.productVariants.nodes)if(v.sku)rows.push([v.sku,v.displayName||'',v.price||'',v.inventoryQuantity==null?'':v.inventoryQuantity]);
    if(!d.productVariants.pageInfo.hasNextPage)break;after=d.productVariants.pageInfo.endCursor;
  }
  return rows;
}
async function shopifyDraft(order){
  if(order.source?.kind==='web'&&order.source.store==='shopify')throw new Error('Este pedido ya está en Shopify: no hace falta crear un borrador');
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
  return (d.orders?.nodes||[]).map(o=>({store:'shopify',id:o.id,account:cfg.shop,name:o.name,createdAt:o.createdAt,email:o.email||'',phone:o.phone||o.shippingAddress?.phone||'',note:o.note||'',customerName:o.customer?.displayName||o.shippingAddress?.name||'',company:o.billingAddress?.company||o.shippingAddress?.company||'',
    shippingAddress:addr(o.shippingAddress),billingAddress:addr(o.billingAddress),currency:o.currentTotalPriceSet?.shopMoney?.currencyCode||'EUR',total:Number(o.currentTotalPriceSet?.shopMoney?.amount)||null,
    lines:(o.lineItems?.nodes||[]).map(l=>({sku:l.sku||'',title:l.title||'',qty:l.quantity,price:Number(l.originalUnitPriceSet?.shopMoney?.amount)||null}))}));
}

// Stock desde Shopify o desde la API del programa del cliente. Devuelve {REFERENCIA: unidades}.
async function stockLookup({refs,cfg}){
  const out={};
  if(cfg?.source==='shopify'){
    for(let i=0;i<refs.length;i+=20){
      const q=refs.slice(i,i+20).map(r=>'sku:'+JSON.stringify(String(r))).join(' OR ');
      const d=await shopGql('query($q:String!){productVariants(first:100,query:$q){nodes{sku inventoryQuantity}}}',{q});
      for(const v of d.productVariants.nodes)if(v.sku&&v.inventoryQuantity!=null)out[v.sku]=v.inventoryQuantity;
    }
    return out;
  }
  if(cfg?.source==='erp'){
    const rows=await erpRows('catalog');const m={};
    for(const r of rows.slice(1)){const v=Number(r[3]);if(r[0]&&r[3]!==''&&Number.isFinite(v))m[r[0]]=v}
    return m;
  }
  if(cfg?.source==='webhook'){
    if(!/^https:\/\//i.test(cfg.url||''))throw new Error('El servicio de stock debe empezar por https://');
    const ac=new AbortController();const t=setTimeout(()=>ac.abort(),20000);
    try{
      const r=await fetch(cfg.url,{method:'POST',signal:ac.signal,headers:{'Content-Type':'application/json',...(cfg.token?{Authorization:'Bearer '+cfg.token}:{})},body:JSON.stringify({referencias:refs,refs})});
      if(!r.ok)throw new Error('El servicio de stock respondió '+r.status);
      const j=await r.json().catch(()=>null);
      const src=Array.isArray(j)?j:Array.isArray(j?.stock)?j.stock:null;
      if(src){for(const x of src){const k=x.ref||x.referencia||x.sku,v=Number(x.stock??x.unidades??x.disponible);if(k&&Number.isFinite(v))out[k]=v}}
      else{const m=j?.stock&&typeof j.stock==='object'?j.stock:j||{};for(const [k,v] of Object.entries(m)){const n=Number(v);if(Number.isFinite(n))out[k]=n}}
      return out;
    }finally{clearTimeout(t)}
  }
  return out;
}

// ---------------------------------------------------------------- programa de gestión y tiendas del cliente
// Las claves se guardan cifradas en el estado seguro de la app (state.secret.ordersErp), nunca en orders.json.
const erpCache={customers:{at:0,rows:null},catalog:{at:0,rows:null}};
const TTL={customers:10*60e3,catalog:2*60e3};
async function erpSecret(){const s=await readState();return {s,cfg:s.secret?.ordersErp||{}}}
function orderStoreId(key,x={}){return String(x.id||String(key||'').split(':')[0]||'').toLowerCase()}
function orderStoreHost(x={}){try{return new URL(String(x.url||'')).host.toLowerCase()}catch{return ''}}
function orderChannelUsageFromState(s){
  const stores=Object.entries(s.secret?.ordersErp?.stores||{});
  const items=[];
  if(s.secret?.integrations?.shopify?.shop)items.push({type:'shopify',label:'Shopify · '+s.secret.integrations.shopify.shop});
  for(const [key,x] of stores){const id=orderStoreId(key,x),host=orderStoreHost(x);items.push({type:id,label:(connectors.STORES[id]?.name||id||'Tienda')+(host?' · '+host:'')})}
  const limit=policy.orderChannelLimit?policy.orderChannelLimit(s.license):1;
  return {used:items.length,limit:(policy.isMaster&&policy.isMaster(s.license))?null:limit,items};
}
async function assertOrderChannelCapacity({storeId='',url='',replacing=false}={}){
  const s=await readState();if(policy.isMaster&&policy.isMaster(s.license))return true;
  const usage=orderChannelUsageFromState(s);
  const host=(()=>{try{return new URL(String(url||'')).host.toLowerCase()}catch{return ''}})();
  const exists=replacing||(storeId&&host&&Object.entries(s.secret?.ordersErp?.stores||{}).some(([k,x])=>orderStoreId(k,x)===storeId&&orderStoreHost(x)===host));
  if(!exists&&usage.used>=usage.limit){
    const e=new Error('Has usado '+usage.used+' de '+usage.limit+' canales de pedidos incluidos. Añade otro canal por 29 €/mes o cambia de plan.');
    e.code='ORDER_CHANNEL_LIMIT';throw e;
  }
  return true;
}
async function saveErpSecret(mut){if(!safeStorage?.isEncryptionAvailable?.())throw new Error('Este equipo no tiene disponible el cifrado seguro del sistema. No guardaré claves de programas sin cifrar.');const s=await readState();s.secret=s.secret||{};s.secret.ordersErp=s.secret.ordersErp||{};mut(s.secret.ordersErp);await writeState(s)}
async function erpAdapter(){
  const {cfg}=await erpSecret();const p=cfg.program;if(!p||!connectors.PROGRAMS[p.id]?.make)return null;
  return {id:p.id,cfg:p.cfg,adapter:connectors.PROGRAMS[p.id].make(p.cfg,{fetch:(...a)=>fetch(...a)})};
}
async function erpRows(kind){
  const x=erpCache[kind];if(x.rows&&Date.now()-x.at<TTL[kind])return x.rows;
  const a=await erpAdapter();if(!a)return null;
  const rows=await a.adapter[kind]();erpCache[kind]={at:Date.now(),rows};return rows;
}
const dash='\n\nOtros programas (Sage 50/200, a3, Business Central, SAP Business One…): de momento se conectan con un archivo a tu medida («destino: archivo en C:\\Pedidos», CSV/XML/JSON con las columnas que pida tu programa) o con «destino: webhook https://…», que sirve con Make, Zapier o las plataformas de integración que ya tengan conector para tu programa.';
function programList(){
  const L=Object.values(connectors.PROGRAMS).map(p=>'• '+p.name+' — '+(p.kind==='api'?'conexión directa pegando una clave':'archivos de importación oficiales'));
  const W=Object.values(connectors.STORES).map(p=>'• '+p.name+' — pedidos de tu tienda web');
  return 'Programas que puedo conectar (escribe «programa: nombre» y te digo cómo, en 3 pasos):\n'+L.join('\n')+'\n\nTiendas online (pedidos web): Shopify (ya conectada desde Conexiones)\n'+W.join('\n')+dash;
}
const erpApi={
  async list(){return programList()},
  async connect(text){
    const a=connectors.parseArgs(text);
    if(!a.id||a.id==='ayuda'||a.id==='lista')return {ok:false,message:programList()};
    const P=connectors.PROGRAMS[a.id];
    if(!P)return {ok:false,message:'Todavía no tengo conector para «'+a.id+'».\n\n'+programList()};
    if(P.kind==='files'){
      if(!a.dir)return {ok:false,message:P.name+'\n'+P.how};
      const cfg={dir:a.dir,serie:a.serie||1,start:a.start??900000,almacen:a.almacen||'GEN'};
      try{await fs.mkdir(cfg.dir,{recursive:true});await fs.writeFile(path.join(cfg.dir,'LEEME-IMPORTAR.txt'),connectors.FACTUSOL_LEEME(cfg.dir),'utf8')}
      catch(e){return {ok:false,message:'No puedo usar esa carpeta: '+String(e?.message||e).slice(0,100)}}
      await saveErpSecret(o=>{o.program={id:'factusol',cfg}});erpCache.customers={at:0,rows:null};erpCache.catalog={at:0,rows:null};
      return {ok:true,settings:{erp:{id:'factusol',label:P.name,kind:'files'},destination:{type:'factusol',...cfg}},
        message:'✅ Factusol preparado. Los pedidos listos se añadirán a PCL.xlsx y LPC.xlsx (y CLI.xlsx si hay clientes nuevos) en '+cfg.dir+'\nSerie '+cfg.serie+' · números de documento desde '+cfg.start+' · almacén '+cfg.almacen+'.\n\nPara comprobar clientes y stock indícame tus Excel exportados: «clientes: C:\\…\\clientes.xlsx» y «catálogo: C:\\…\\articulos.xlsx».\nCuando entregue pedidos, sigue LEEME-IMPORTAR.txt de esa carpeta (Utilidades > Importaciones > Ficheros .XLSX/.XLS) y después escribe «importados».'};
    }
    const need={holded:['key'],odoo:['url','key'],dolibarr:['url','key']}[P.id]||[];
    if(need.some(k=>!a[k]))return {ok:false,message:P.name+': me falta '+need.filter(k=>!a[k]).map(k=>({key:'la clave',url:'la dirección web'}[k])).join(' y ')+'.\n\n'+P.how};
    const cfg={...(a.url?{url:a.url}:{}),key:a.key,...(a.db?{db:a.db}:{}),...(a.user?{user:a.user}:{}),...(a.confirm?{confirm:true}:{})};
    const adapter=P.make(cfg,{fetch:(...x)=>fetch(...x)});
    let cust,cat;
    try{await adapter.test();cust=await adapter.customers();cat=await adapter.catalog()}
    catch(e){return {ok:false,message:'No he podido conectar con '+P.name+': '+String(e?.message||e).slice(0,220)+'\n\n'+P.how}}
    await saveErpSecret(o=>{o.program={id:P.id,cfg}});erpCache.customers={at:Date.now(),rows:cust};erpCache.catalog={at:Date.now(),rows:cat};
    const nStock=cat.slice(1).filter(r=>r[3]!=='').length;
    return {ok:true,settings:{erp:{id:P.id,label:P.name,kind:'api'},customers:{type:'erp'},catalog:{type:'erp'},stock:{source:'erp'},destination:{type:'erp',id:P.id}},
      message:'✅ Conectado con '+P.name+'. He leído '+(cust.length-1)+' clientes y '+(cat.length-1)+' artículos ('+nStock+' con stock).\n'+
        'Desde ahora compruebo clientes, referencias y stock con tus datos de '+P.name+' y los pedidos listos se crean directamente allí'+(P.id==='odoo'?(cfg.confirm?' (como pedido confirmado)':' (como presupuesto; añade «confirmar» al conectar si quieres que se confirmen solos)'):'')+'.\nTu clave se ha guardado cifrada en este ordenador. Si quieres, borra este mensaje del chat.'};
  },
  async connectStore(text){
    const a=connectors.parseArgs(text);const S=connectors.STORES[a.id];
    if(!S)return {ok:false,message:'Tiendas que puedo conectar:\n'+Object.values(connectors.STORES).map(x=>'• '+x.name+'\n'+x.how).join('\n\n')+'\n\nShopify se conecta desde Conexiones.'};
    if(!a.url||!a.key||!a.secret)return {ok:false,message:S.name+': me falta '+[!a.url&&'la dirección web',!a.key&&'la clave',!a.secret&&'el secreto'].filter(Boolean).join(', ')+'.\n\n'+S.how};
    const cfg={id:S.id,url:a.url,key:a.key,secret:a.secret};
    try{await assertOrderChannelCapacity({storeId:S.id,url:cfg.url})}catch(e){return {ok:false,message:e.message}}
    try{await S.make(cfg,{fetch:(...x)=>fetch(...x)}).test()}catch(e){return {ok:false,message:'No he podido conectar con '+S.name+': '+String(e?.message||e).slice(0,200)+'\n\n'+S.how}}
    const host=new URL(cfg.url).host.toLowerCase(),storeKey=S.id+':'+host;
    await saveErpSecret(o=>{o.stores=o.stores||{};for(const [k,x] of Object.entries(o.stores)){if(orderStoreId(k,x)===S.id&&orderStoreHost(x)===host)delete o.stores[k]}o.stores[storeKey]=cfg});
    const usage=orderChannelUsageFromState((await erpSecret()).s);
    return {ok:true,message:'✅ Conectada tu tienda '+S.name+' ('+host+'). Leeré sus pedidos «en proceso» o «en espera» igual que los del correo. Canales de pedidos usados: '+usage.used+(usage.limit==null?' (Maestro)':' de '+usage.limit)+'. Tu clave se ha guardado cifrada.'};
  },
  async disconnect(){await saveErpSecret(o=>{delete o.program;delete o.stores});erpCache.customers={at:0,rows:null};erpCache.catalog={at:0,rows:null};return 'He desconectado tu programa y tus tiendas y he borrado sus claves de este ordenador.'},
  async closeBatch(){
    const {cfg}=await erpSecret();const d=cfg.program?.cfg?.dir;if(!d)return 'No hay ningún lote de importación abierto.';
    const names=['PCL.xlsx','LPC.xlsx','CLI.xlsx','LEEME-IMPORTAR.txt'];const t=new Date();const p2=n=>String(n).padStart(2,'0');
    const dest=path.join(d,'importados','lote-'+t.getFullYear()+p2(t.getMonth()+1)+p2(t.getDate())+'-'+p2(t.getHours())+p2(t.getMinutes()));
    let moved=0;await fs.mkdir(dest,{recursive:true});
    for(const n of names){try{await fs.rename(path.join(d,n),path.join(dest,n));moved++}catch{}}
    if(moved){try{await fs.writeFile(path.join(d,'LEEME-IMPORTAR.txt'),connectors.FACTUSOL_LEEME(d),'utf8')}catch{}}
    return moved?'Lote cerrado: he guardado '+moved+' archivo(s) en '+dest+'. Los próximos pedidos empezarán un lote nuevo.':'No había archivos pendientes de importar.';
  }
};
async function erpDeliver(order,d,ctx){
  const a=await erpAdapter();if(!a)throw new Error('El programa ya no está conectado: escribe «programa: …» para volver a conectarlo');
  return a.adapter.createOrder(order,{lineMatch:ctx.lineMatch,leadTime:ctx.leadTime});
}
async function factusolDeliver(order,d,ctx){
  const r=connectors.buildFactusol(ctx.batch,{serie:d.serie||1,start:d.start??900000,almacen:d.almacen||'GEN',customers:ctx.customers||[],lineMatch:(o,i)=>o.verification?.lines?.[i]?.match||null});
  const mine=r.errors.find(e=>e.startsWith(order.internalRef));if(mine)throw new Error(mine);
  await fs.mkdir(d.dir,{recursive:true});
  await fs.writeFile(path.join(d.dir,'PCL.xlsx'),connectors.writeXlsx(r.PCL));
  await fs.writeFile(path.join(d.dir,'LPC.xlsx'),connectors.writeXlsx(r.LPC));
  if(r.CLI)await fs.writeFile(path.join(d.dir,'CLI.xlsx'),connectors.writeXlsx(r.CLI));
  try{await fs.access(path.join(d.dir,'LEEME-IMPORTAR.txt'))}catch{await fs.writeFile(path.join(d.dir,'LEEME-IMPORTAR.txt'),connectors.FACTUSOL_LEEME(d.dir),'utf8')}
  return {ok:true,type:'factusol',path:d.dir,docNumber:r.docs[order.id],erpNumber:'Serie '+(d.serie||1)+' · nº '+r.docs[order.id]};
}
// Pedidos web de todas las tiendas conectadas (Shopify + WooCommerce).
async function allWebOrders(o){
  const out=[],errs=[];
  try{out.push(...await shopifyWebOrders(o))}catch(e){errs.push('Shopify: '+String(e?.message||e))}
  const {cfg}=await erpSecret();
  for(const [key,x] of Object.entries(cfg.stores||{})){
    const id=orderStoreId(key,x),S=connectors.STORES[id];if(!S)continue;
    try{out.push(...await S.make(x,{fetch:(...a)=>fetch(...a)}).orders(o))}catch(e){errs.push(S.name+': '+String(e?.message||e))}
  }
  if(!out.length&&errs.length)throw new Error(errs.join(' · '));
  return out;
}

async function loadList(kind,src){
  if(!src)return null;
  if(src.type==='erp')return erpRows(kind==='customers'?'customers':'catalog');
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
async function orderChannelStatus(){
  const s=await readState(),u=orderChannelUsageFromState(s);
  return {...u,level:policy.orderWebLevel?policy.orderWebLevel(s.license):'basic',extraMonthlyEur:29};
}
async function webOrderLevel(){
  const s=await readState();return policy.orderWebLevel?policy.orderWebLevel(s.license):'basic';
}
function get(){
  if(instance)return instance;
  instance=createOrders({dir:path.join(app.getPath('userData'),'orders'),mail,extract,files:{extract:files.extractText},webOrders:allWebOrders,erp:erpApi,stockLookup,monthlyLimit,webOrderLevel,confirm,notify,audit,loadList,fetch:(...a)=>fetch(...a),pickFolder,pickFile,
    deliverers:{shopify_draft:shopifyDraft,erp:erpDeliver,factusol:factusolDeliver}});
  return instance;
}
async function handleChat(text){return get().handleChat(text)}
function startScheduler(){
  if(timer)return;
  const tick=()=>get().tick().catch(e=>console.error('orders_tick_error',String(e?.message||e).slice(0,160)));
  const first=setTimeout(tick,2*60*1000);first.unref?.();
  timer=setInterval(tick,15*60*1000);timer.unref?.();
}
module.exports={handleChat,startScheduler,orderChannelStatus,_get:get,_deps:deps,_adapters:{gmailAdapter,imapAdapter},_shopify:{shopifyDraft,shopifyCustomers,shopifyCatalog,shopifyWebOrders},_stockLookup:stockLookup,_erpApi:erpApi,_erpRows:erpRows,_allWebOrders:allWebOrders};
