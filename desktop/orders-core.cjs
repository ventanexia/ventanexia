'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');

const DEFAULTS={
  mode:'ask',autoScan:true,scanDays:14,maxPerScan:115,maxExtractionsPerDay:60,
  newCustomer:'ask',requiredCustomerData:['name','taxId','address','deliveryAddress','email','phone'],
  minConfidence:0.85,accounts:null,destination:null,customers:null,catalog:null,signature:'',
  webOrders:true,keywords:'pedido|pedidos|order|orders|compra|purchase|albar[aá]n|solicitud|reposici[oó]n|orden de compra|\\bpo[- ]?\\d'
};
const FIELD_LABEL={name:'Razón social o nombre',taxId:'CIF/NIF',address:'Dirección fiscal',deliveryAddress:'Dirección de entrega',email:'Email de contacto',phone:'Teléfono',contact:'Persona de contacto'};
const FINAL=new Set(['introducido','descartado']);
const norm=v=>String(v??'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const clean=(v,n=300)=>String(v??'').replace(/\s+/g,' ').trim().slice(0,n);
const alnum=v=>norm(v).toUpperCase().replace(/[^A-Z0-9]/g,'');
const emailOf=v=>(String(v||'').match(/[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,10}/i)||[''])[0].toLowerCase();
const hash=v=>crypto.createHash('sha256').update(String(v||'')).digest('hex').slice(0,24);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function parseQty(v){if(typeof v==='number')return Number.isFinite(v)?v:NaN;const m=String(v??'').replace(/\s/g,'').match(/^-?\d+(?:[.,]\d+)?/);return m?Number(m[0].replace(',','.')):NaN}
function nameSim(a,b){a=norm(a).replace(/\b(sl|sa|slu|sll|sociedad|limitada|anonima)\b/g,' ').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();b=norm(b).replace(/\b(sl|sa|slu|sll|sociedad|limitada|anonima)\b/g,' ').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();if(!a||!b)return 0;if(a===b)return 1;const A=new Set(a.split(' ')),B=new Set(b.split(' '));let hit=0;for(const x of A)if(B.has(x))hit++;return hit/Math.max(A.size,B.size)}

function createStore(dir){
  const file=path.join(dir,'orders.json'); let queue=Promise.resolve();
  const blank=()=>({version:2,seq:0,settings:{...DEFAULTS},orders:{},seen:{},extractions:{day:'',count:0}});
  async function load(){try{const s=JSON.parse(await fs.readFile(file,'utf8'));const b=blank();return {...b,...s,settings:{...b.settings,...(s.settings||{})},orders:s.orders||{},seen:s.seen||{},extractions:s.extractions||b.extractions}}catch(e){if(e?.code!=='ENOENT'){}return blank()}}
  function update(fn){const run=queue.then(async()=>{const s=await load(),next=(await fn(s))||s;await fs.mkdir(dir,{recursive:true});const tmp=file+'.tmp';await fs.writeFile(tmp,JSON.stringify(next,null,2));await fs.rename(tmp,file);return next});queue=run.catch(()=>{});return run}
  return {load,update,file};
}

const COLS={
  code:/^(cod|codigo|id|num|numero|nº|cliente id|customer id|account)/,
  name:/(razon|nombre|cliente|empresa|denominacion|company|name|titular)/,
  taxId:/(cif|nif|vat|nie|dni|identificacion|fiscal|tax)/,
  email:/(mail|correo)/,phone:/(tel|movil|phone|fono)/,address:/(direccion|domicilio|address|calle)/,
  ref:/^(ref|referencia|sku|articulo|codigo|cod|item|producto ref|part)/,
  description:/(descripcion|denominacion|nombre|producto|articulo|description|title)/,price:/(precio|pvp|tarifa|price|importe)/
};
function tableToRecords(rows,wanted){
  if(!rows?.length)return [];let hi=-1,map=null;
  for(let i=0;i<Math.min(8,rows.length);i++){const h=(rows[i]||[]).map(x=>norm(x));const m={};for(const key of wanted){const idx=h.findIndex((x,j)=>!Object.values(m).includes(j)&&COLS[key]?.test(x));if(idx>=0)m[key]=idx}if(Object.keys(m).length>=2){hi=i;map=m;break}}
  if(!map)return [];
  return rows.slice(hi+1).map(r=>{const o={};for(const [k,i] of Object.entries(map))o[k]=clean(r?.[i],250);return o}).filter(o=>Object.values(o).some(Boolean));
}
function loadCustomers(rows){return tableToRecords(rows,['code','name','taxId','email','phone','address']).filter(c=>c.name||c.taxId||c.email).map(c=>({...c,taxKey:alnum(c.taxId),email:(c.email||'').toLowerCase()}))}
function loadCatalog(rows){return tableToRecords(rows,['ref','description','price']).filter(c=>c.ref).map(c=>({...c,refKey:alnum(c.ref)}))}
function matchCustomer(c,customers){
  if(!customers?.length)return {status:'sin_lista',match:null};
  const tax=alnum(c?.taxId),mail=emailOf(c?.email);
  let exact=tax&&customers.find(x=>x.taxKey===tax);if(exact)return {status:'exacto',match:exact,by:'taxId'};
  exact=mail&&customers.find(x=>x.email===mail);if(exact)return {status:'exacto',match:exact,by:'email'};
  const scored=customers.map(x=>({x,s:nameSim(c?.name,x.name)})).sort((a,b)=>b.s-a.s);
  if(scored[0]?.s>=0.9&&(!scored[1]||scored[0].s-scored[1].s>=0.15))return {status:'exacto',match:scored[0].x,by:'name'};
  return {status:'nuevo',match:null};
}
function matchLine(line,catalog){
  if(!catalog?.length)return {status:'sin_catalogo',match:null};
  const k=alnum(line?.ref);if(!k)return {status:'dudosa',match:null};
  const x=catalog.find(c=>c.refKey===k);return x?{status:'exacta',match:x}:{status:'desconocida',match:null};
}
function validateExtraction(raw,sourceText=''){
  const out={isOrder:raw?.isOrder===true,confidence:Math.max(0,Math.min(1,Number(raw?.confidence)||0)),orderRef:clean(raw?.orderRef,80)||null,orderDate:clean(raw?.orderDate,40)||null,currency:clean(raw?.currency,8)||null,customer:{},lines:[],notes:clean(raw?.notes,800),total:Number.isFinite(Number(raw?.total))?Number(raw.total):null,issues:[]};
  const src=String(sourceText||''),srcNorm=alnum(src),srcLower=src.toLowerCase(),digits=src.replace(/\D/g,'');
  for(const k of ['name','taxId','email','phone','address','deliveryAddress','contact'])out.customer[k]=clean(raw?.customer?.[k],250)||null;
  if(out.customer.taxId&&!srcNorm.includes(alnum(out.customer.taxId))){out.issues.push({code:'taxid_not_source'});out.customer.taxId=null}
  if(out.customer.email){const e=emailOf(out.customer.email);if(!e||!srcLower.includes(e)){out.issues.push({code:'email_not_source'});out.customer.email=null}else out.customer.email=e}
  if(out.customer.phone){const d=String(out.customer.phone).replace(/\D/g,'');if(d.length<7||!digits.includes(d.slice(-9))){out.issues.push({code:'phone_not_source'});out.customer.phone=null}}
  for(const l of Array.isArray(raw?.lines)?raw.lines.slice(0,200):[]){
    const ref=clean(l?.ref,80)||null,description=clean(l?.description,250)||null,qty=parseQty(l?.qty),price=parseQty(l?.price);
    if(!ref&&!description)continue;
    const flags=[];if(ref&&!srcNorm.includes(alnum(ref))){flags.push('ref_not_source');out.issues.push({code:'ref_not_source',ref})}
    if(!Number.isFinite(qty)||qty<=0){flags.push('bad_qty');out.issues.push({code:'bad_qty',ref})}
    out.lines.push({ref:flags.includes('ref_not_source')?null:ref,description,qty:Number.isFinite(qty)?qty:null,unit:clean(l?.unit,30)||null,price:Number.isFinite(price)?price:null,flags});
  }
  if(out.isOrder&&!out.lines.length){out.issues.push({code:'no_lines'});out.confidence=Math.min(out.confidence,.4)}
  return out;
}
function linesFromRows(rows){
  if(!rows?.length)return [];const recs=tableToRecords(rows,['ref','description','price']);
  // qty is intentionally found independently so a misleading price column cannot become quantity.
  let hi=-1,qtyIdx=-1;
  for(let i=0;i<Math.min(8,rows.length);i++){const h=(rows[i]||[]).map(x=>norm(x));const q=h.findIndex(x=>/^(cantidad|cant|qty|quantity|unidades|uds|units?)$/.test(x));if(q>=0){hi=i;qtyIdx=q;break}}
  if(hi<0)return [];
  const refIdx=(rows[hi]||[]).map(x=>norm(x)).findIndex(x=>COLS.ref.test(x)),descIdx=(rows[hi]||[]).map(x=>norm(x)).findIndex(x=>COLS.description.test(x));
  return rows.slice(hi+1).map(r=>({ref:clean(r?.[refIdx],80)||null,description:clean(r?.[descIdx],250)||null,qty:parseQty(r?.[qtyIdx])})).filter(x=>(x.ref||x.description)&&Number.isFinite(x.qty)&&x.qty>0);
}
function crossCheck(ex,tableLines){
  if(!tableLines?.length)return {ok:true,checked:false};
  const a=(ex.lines||[]).filter(l=>l.ref&&Number.isFinite(l.qty)).map(l=>[alnum(l.ref),Number(l.qty)]).sort();
  const b=tableLines.filter(l=>l.ref&&Number.isFinite(l.qty)).map(l=>[alnum(l.ref),Number(l.qty)]).sort();
  const ok=a.length===b.length&&a.every((x,i)=>x[0]===b[i][0]&&x[1]===b[i][1]);
  return {ok,checked:true};
}
function verifyOrder(ex,customers,catalog,settings={}){
  const customer=matchCustomer(ex.customer,customers),lines=(ex.lines||[]).map(l=>({...l,verification:matchLine(l,catalog)}));
  const missing=(settings.requiredCustomerData||DEFAULTS.requiredCustomerData).filter(k=>!ex.customer?.[k]);
  const issues=[...(ex.issues||[])];
  if(customer.status==='nuevo'&&missing.length)issues.push({code:'new_customer_missing'});
  if(lines.some(l=>l.verification.status==='desconocida'||l.verification.status==='dudosa'))issues.push({code:'catalog_mismatch'});
  if(ex.confidence<(settings.minConfidence||DEFAULTS.minConfidence))issues.push({code:'low_confidence'});
  return {customer,lines,missing,issues};
}
function orderRows(o){return (o.extracted?.lines||[]).map(l=>({order:o.extracted.orderRef||o.id,customer:o.extracted.customer?.name||'',ref:l.ref||'',description:l.description||'',qty:l.qty??'',price:l.price??'',delivery:o.extracted.customer?.deliveryAddress||''}))}
function csvCell(v){v=String(v??'');return /[;"\r\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v}
function buildFile(o,format='csv'){
  const rows=orderRows(o);format=String(format||'csv').toLowerCase();
  if(format==='json')return {ext:'json',content:JSON.stringify({id:o.id,...o.extracted},null,2)};
  if(format==='xml'){const esc=v=>String(v??'').replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));return {ext:'xml',content:'<?xml version="1.0" encoding="UTF-8"?><order id="'+esc(o.id)+'">'+rows.map(r=>'<line ref="'+esc(r.ref)+'" qty="'+esc(r.qty)+'"><description>'+esc(r.description)+'</description></line>').join('')+'</order>'}}
  const headers=['order','customer','ref','description','qty','price','delivery'];return {ext:'csv',content:[headers.join(';'),...rows.map(r=>headers.map(h=>csvCell(r[h])).join(';'))].join('\r\n')}
}
async function deliverToFile(o,destination){const f=buildFile(o,destination.format||'csv');await fs.mkdir(destination.dir,{recursive:true});const p=path.join(destination.dir,'pedido-'+String(o.seq||o.id).replace(/[^a-z0-9_-]/gi,'_')+'.'+f.ext);await fs.writeFile(p,f.content,'utf8');return {ok:true,type:'file',path:p}}
async function deliverToWebhook(o,destination,fetchFn=fetch){if(!/^https:\/\//i.test(destination.url||''))throw new Error('El webhook debe usar https');const key='vnx-order-'+o.id;const r=await fetchFn(destination.url,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key,...(destination.headers||{})},body:JSON.stringify({id:o.id,idempotencyKey:key,order:o.extracted})});if(!r.ok)throw new Error('Webhook respondió '+r.status);return {ok:true,type:'webhook',status:r.status}}

function parseCommand(raw=''){
  const s=String(raw||'').trim(),n=norm(s);let m,num=(n.match(/(?:pedido\s*#?\s*|#)(\d+)/)||[])[1];
  if(!s||/^(ayuda|help|como funciona|configurar)$/.test(n))return {type:'help'};
  if((m=s.match(/^\s*destino\s*:\s*archivo(?:\s+(?:en|a))?\s+(.+)$/i)))return {type:'set',key:'destination',value:{type:'file',dir:m[1].trim().replace(/^["']|["']$/g,''),format:'csv'}};
  if((m=s.match(/^\s*destino\s*:\s*(csv|xml|json)\s+(?:en|a)\s+(.+)$/i)))return {type:'set',key:'destination',value:{type:'file',dir:m[2].trim().replace(/^["']|["']$/g,''),format:m[1].toLowerCase()}};
  if((m=s.match(/^\s*destino\s*:\s*(?:webhook|api)\s+(https:\/\/\S+)/i)))return {type:'set',key:'destination',value:{type:'webhook',url:m[1]}};
  if(/^\s*destino\s*:\s*shopify/i.test(s))return {type:'set',key:'destination',value:{type:'shopify_draft'}};
  if((m=s.match(/^\s*(clientes|catalogo|catálogo)\s*:\s*(.+)$/i)))return {type:'set-file',key:/clientes/i.test(m[1])?'customers':'catalog',path:m[2].trim().replace(/^["']|["']$/g,'')};
  if((m=n.match(/^modo\s*:\s*(automatico|automático|auto|pedir permiso|permiso|ask|solo preparar|preparar)/)))return {type:'set',key:'mode',value:/auto/.test(m[1])?'auto':/prepar/.test(m[1])?'prepare':'ask'};
  if(/^(revisa|comprueba|busca|mira|actualiza|escanea|lee|hay|recoge|recibe|detecta).*pedid|^pedidos nuevos/.test(n))return {type:'scan'};
  if(/^(ver|muestra|lista).*listos/.test(n))return {type:'list',filter:'listo'};
  if(/^(ver|muestra|lista).*pendient/.test(n))return {type:'list',filter:'pendiente'};
  if(/^(ver|muestra|lista).*pedid/.test(n))return {type:'list',filter:'todos'};
  if(/^(pide|solicita).*dato/.test(n))return {type:'request',n:num?Number(num):null};
  if(/^(introduce|mete|registra|entrega|envia|manda|vuelca|carga)/.test(n))return {type:'deliver',n:num?Number(num):null};
  if(num&&(/pedido/.test(n)||/^#\d+/.test(n)))return {type:'detail',n:Number(num)};
  if(/^(estado|resumen)/.test(n))return {type:'status'};
  if(/^(descarta|ignora|borra|elimina|cancela)/.test(n)&&num)return {type:'discard',n:Number(num)};
  return {type:'help'};
}

function createOrders(deps){
  const {mail,extract,files,webOrders,monthlyLimit,confirm,notify,audit=async()=>{},loadList,fetch:fetchFn=fetch,pickFolder,pickFile,deliverers={}}=deps;
  const store=createStore(deps.dir);
  const today=()=>new Date().toISOString().slice(0,10),month=()=>new Date().toISOString().slice(0,7);
  function history(o,type,text){o.history=o.history||[];o.history.push({at:new Date().toISOString(),type,text:clean(text,300)})}
  async function lists(s){const customers=s.settings.customers?loadCustomers(await loadList('customers',s.settings.customers)||[]):[],catalog=s.settings.catalog?loadCatalog(await loadList('catalog',s.settings.catalog)||[]):[];return {customers,catalog}}
  async function monthUsage(){const s=await store.load(),limit=await monthlyLimit();const used=Object.values(s.orders).filter(o=>String(o.createdAt||'').startsWith(month())).length;return {used,limit,reached:limit!=null&&used>=limit}}
  function sourceText(full,atts){return [full.subject,full.from,full.text,...atts.map(a=>a.text)].filter(Boolean).join('\n')}
  async function readMail(acc,item){const full=await mail.fetchFull(acc,item.id),atts=[],tables=[];for(const a of full.attachments||[]){const r=await files.extract(a);atts.push(r);if(r.rows?.length)tables.push(...(r.sheets?.flatMap(s=>s.rows)||[r.rows]))}return {full,atts,tables,sourceText:sourceText(full,atts)}}
  function statusFor(ex,v,cross,sourceKind){if(!ex.isOrder)return 'descartado';if(!cross.ok||v.issues.length)return 'revisar';if(v.customer.status==='nuevo'&&v.missing.length)return 'falta_datos';if(sourceKind==='pdf'||sourceKind==='text')return 'revisar';return 'listo'}
  async function ingest({key,account,kind='email',full,atts=[],tables=[],preExtracted=null,sourceKind='text'}){
    const mu=await monthUsage();if(mu.reached)return null;
    const exists=(await store.load()).seen[key];if(exists)return null;
    const text=kind==='shopify'?JSON.stringify(preExtracted):sourceText(full,atts);
    const raw=preExtracted||await extract({mode:'extract',message:{from:full.from||full.email,subject:full.subject||full.name,date:full.date||full.createdAt,text:full.text||full.note,attachments:atts.filter(x=>x.text).map(x=>({name:x.name,text:x.text})),attachmentNotes:atts.filter(x=>x.issue).map(x=>x.name+': '+x.issue)}});
    const ex=preExtracted?raw:validateExtraction(raw,text);if(!ex.isOrder){await store.update(s=>{s.seen[key]='not_order';return s});return null}
    const s=await store.load(),ls=await lists(s),v=verifyOrder(ex,ls.customers,ls.catalog,s.settings);
    const tableLines=tables.length?linesFromRows(tables):[],cross=crossCheck(ex,tableLines);
    const id='ord_'+hash(key),seq=(s.seq||0)+1,status=statusFor(ex,v,cross,sourceKind);
    const o={id,seq,createdAt:new Date().toISOString(),status,source:{kind,account:account?.address||account||'',id:full.id||key,threadId:full.threadId||null,from:full.from||'',fromEmail:full.fromEmail||full.email||'',subject:full.subject||full.name||'',messageIdHeader:full.messageIdHeader||null},extracted:ex,verification:v,crossCheck:cross,request:null,delivery:null,history:[]};
    history(o,'detected','Pedido detectado');if(!cross.ok)history(o,'review','La tabla del adjunto no coincide con la lectura de IA');
    await store.update(x=>{x.seq=Math.max(x.seq||0,seq);x.orders[id]=o;x.seen[key]=id;return x});return o;
  }
  async function scan(){
    const s=await store.load(),settings=s.settings,found=[],errors=[];let accounts=0;
    const mu=await monthUsage();if(mu.reached)return {accounts:0,found,errors,monthly:mu};
    for(const acc of await mail.accounts()){
      if(settings.accounts&&!settings.accounts.includes(acc.address))continue;accounts++;
      try{const since=Date.now()-settings.scanDays*86400e3,items=await mail.listRecent(acc,{sinceMs:since,max:settings.maxPerScan});for(const item of items){if(item.listUnsubscribe)continue;const hay=norm((item.subject||'')+' '+(item.snippet||'')+' '+(item.attachmentNames||[]).join(' '));if(!(new RegExp(settings.keywords,'i')).test(hay))continue;try{const r=await readMail(acc,item),kind=r.atts.some(a=>a.kind==='xlsx'||a.kind==='csv')?'table':r.atts.some(a=>a.kind==='pdf')?'pdf':'text',o=await ingest({key:'mail:'+acc.address+':'+item.id,account:acc,full:r.full,atts:r.atts,tables:r.tables,sourceKind:kind});if(o)found.push(o)}catch(e){errors.push(acc.address+': '+clean(e.message,120))}if((await monthUsage()).reached)break}}catch(e){errors.push(acc.address+': '+clean(e.message,120))}
    }
    if(settings.webOrders&&webOrders){try{for(const w of await webOrders({sinceMs:Date.now()-settings.scanDays*86400e3})){const ex={isOrder:true,confidence:1,orderRef:w.name,orderDate:w.createdAt,currency:w.currency,customer:{name:w.company||w.customerName,email:w.email,phone:w.phone,address:w.billingAddress,deliveryAddress:w.shippingAddress,contact:null},lines:w.lines.map(l=>({ref:l.sku,description:l.title,qty:l.qty,price:l.price})),total:w.total,notes:w.note,issues:[]};const o=await ingest({key:'shopify:'+w.id,account:w.account,kind:'shopify',full:{id:w.id,name:w.name,email:w.email,createdAt:w.createdAt},preExtracted:ex,sourceKind:'shopify'});if(o)found.push(o)}}catch(e){errors.push('Shopify: '+clean(e.message,120))}}
    if(found.length)notify?.('VentaNexIA · Pedidos',found.length+' pedido'+(found.length===1?' nuevo':'s nuevos')+' detectado'+(found.length===1?'':'s'));
    return {accounts,found,errors,monthly:await monthUsage()};
  }
  function pick(s,n){return Object.values(s.orders).find(o=>o.seq===Number(n))}
  function summary(o){return '#'+o.seq+' '+({listo:'✅',falta_datos:'📝',revisar:'⚠️',esperando_cliente:'⏳',introducido:'📦',error:'❌',descartado:'🗑️'}[o.status]||'•')+' '+(o.extracted?.customer?.name||o.source?.fromEmail||'Cliente')+' · '+o.status}
  function detail(o){const v=o.verification||{},lines=(o.extracted?.lines||[]).map(l=>'• '+(l.ref||'[sin ref]')+' × '+(l.qty??'?')+' '+(l.description||'')).join('\n');return summary(o)+'\n'+(o.extracted?.orderRef?'Pedido cliente: '+o.extracted.orderRef+'\n':'')+(o.source?.subject?'Asunto: '+o.source.subject+'\n':'')+lines+(v.missing?.length?'\nFaltan: '+v.missing.map(k=>FIELD_LABEL[k]||k).join(', '):'')+(v.issues?.length?'\n⚠ Requiere revisión: '+v.issues.map(x=>x.code).join(', '):'')+(!o.crossCheck?.ok?'\n⚠ El Excel/CSV no coincide con la lectura automática.':'')+(o.delivery?.ok?'\nEntregado: '+(o.delivery.path||o.delivery.type):'')}
  async function checkReplies(){
    const s=await store.load();for(const o of Object.values(s.orders).filter(x=>x.status==='esperando_cliente'&&x.request?.sentAt)){try{const acc=(await mail.accounts()).find(a=>a.address===o.source.account)||(await mail.accounts())[0];if(!acc)continue;const reps=await mail.listReplies(acc,{threadId:o.request.threadId,fromEmail:o.source.fromEmail,afterMs:new Date(o.request.sentAt).getTime()});if(!reps.length)continue;const last=reps[reps.length-1],fill=await extract({mode:'fill',missing:o.request.missing,message:{from:last.from,subject:last.subject,date:last.date,text:last.text,attachments:[]}});await store.update(x=>{const y=x.orders[o.id];for(const k of y.request.missing)if(fill?.customer?.[k])y.extracted.customer[k]=clean(fill.customer[k],250);const still=y.request.missing.filter(k=>!y.extracted.customer[k]);y.verification.missing=still;y.status=still.length?'falta_datos':'revisar';history(y,'reply','Respuesta del cliente recibida');return x})}catch{}}
  }
  async function requestMissing(o){
    if(!o?.verification?.missing?.length)return {ok:false,reason:'nada'};const to=o.extracted.customer.email||o.source.fromEmail;if(!to)return {ok:false,reason:'sin_email'};
    const s=await store.load();if(s.settings.newCustomer==='never')return {ok:false,reason:'no_permitido'};
    if(s.settings.newCustomer==='ask'){const ok=await confirm({title:'Pedir datos del pedido #'+o.seq,message:'Voy a escribir a '+to,detail:'Pediré únicamente: '+o.verification.missing.map(k=>FIELD_LABEL[k]||k).join(', ')});if(!ok)return {ok:false,reason:'cancelado'}}
    const accs=await mail.accounts(),acc=accs.find(a=>a.address===o.source.account)||accs[0];if(!acc)return {ok:false,reason:'sin_cuenta'};
    const body='Hola,\n\nPara poder tramitar su pedido '+(o.extracted.orderRef||('#'+o.seq))+' necesitamos únicamente estos datos:\n\n'+o.verification.missing.map(k=>'• '+(FIELD_LABEL[k]||k)).join('\n')+'\n\nGracias.'+(s.settings.signature?'\n\n'+s.settings.signature:'');
    const sent=await mail.send(acc,{to,subject:'Datos necesarios para su pedido '+(o.extracted.orderRef||('#'+o.seq)),body,threadId:o.source.threadId,inReplyTo:o.source.messageIdHeader});
    await store.update(x=>{const y=x.orders[o.id];y.request={sentAt:new Date().toISOString(),missing:[...y.verification.missing],threadId:sent.threadId||o.source.threadId};y.status='esperando_cliente';history(y,'request','Datos solicitados al cliente');return x});return {ok:true,to}
  }
  async function deliverOne(o){
    const s=await store.load(),d=s.settings.destination;if(!d)throw new Error('No hay destino configurado');if(o.delivery?.ok)return {ok:true,already:true,...o.delivery};if(o.status!=='listo'&&o.status!=='revisar')throw new Error('El pedido no está listo');
    let r;if(d.type==='file')r=await deliverToFile(o,d);else if(d.type==='webhook')r=await deliverToWebhook(o,d,fetchFn);else if(deliverers[d.type])r=await deliverers[d.type](o,d);else throw new Error('Destino no soportado');
    await store.update(x=>{const y=x.orders[o.id];y.delivery={...r,ok:true,at:new Date().toISOString()};y.status='introducido';history(y,'delivered','Pedido entregado una sola vez');return x});return r
  }
  async function deliverBatch(ids){
    const s=await store.load(),os=ids.map(id=>s.orders[id]).filter(Boolean);if(!os.length)return {ok:false,reason:'nada'};
    if(s.settings.mode==='prepare')return {ok:false,reason:'preparar'};
    if(s.settings.mode==='ask'){const ok=await confirm({title:'Entregar pedidos',message:'Voy a entregar '+os.length+' pedido'+(os.length===1?'':'s')+' al destino configurado.',detail:'No se enviará dos veces el mismo pedido.'});if(!ok)return {ok:false,reason:'cancelado'}}
    const res=[];for(const o of os){try{res.push({o,r:await deliverOne(o)})}catch(e){await store.update(x=>{if(x.orders[o.id]){x.orders[o.id].status='error';history(x.orders[o.id],'error',e.message)}return x});res.push({o,r:{ok:false,error:e.message}})}}return {ok:true,res}
  }
  function autoEligible(o,s){return o.status==='listo'&&s.settings.mode==='auto'&&o.verification?.customer?.status==='exacto'&&(o.verification?.lines||[]).every(l=>l.verification?.status==='exacta')&&o.crossCheck?.ok!==false&&!o.extracted?.issues?.length}
  async function processAuto(){const s=await store.load();if(!s.settings.destination)return;for(const o of Object.values(s.orders))if(autoEligible(o,s))try{await deliverOne(o)}catch{}}
  async function tick(){const s=await store.load();if(s.settings.autoScan)await scan();await checkReplies();await processAuto()}
  const reply=t=>({reply:t,source:'desktop-orders',route:'agent:orders'});
  async function handleChat(text){
    const cmd=parseCommand(text);
    try{
      if(cmd.type==='help')return reply('Pedidos funciona con Gmail, correo IMAP/SMTP y Shopify. Lee el correo completo y adjuntos PDF con texto, Excel, Word y CSV; valida clientes y referencias con tus listas; puede pedir por email solo los datos que falten; y entrega una sola vez por CSV/XML/JSON, webhook/API https o borrador de Shopify.\n\nConfigura con frases como:\n• destino: archivo en C:\\Pedidos\n• destino: json en C:\\Pedidos\n• destino: webhook https://...\n• destino: Shopify\n• clientes: C:\\datos\\clientes.xlsx\n• catálogo: C:\\datos\\articulos.csv\n• modo: pedir permiso / automático / solo preparar\n\nPDF escaneados, conectores ERP directos, stock/Compras y teclear en páginas privadas todavía no están implementados.');
      if(cmd.type==='set-file'){
        let p=cmd.path;if(!p&&pickFile)p=await pickFile();if(!p)return reply('No he cambiado nada.');
        const rows=await deps.filesTable?.(p)||await loadList(cmd.key,{type:'file',path:p});
        const n=cmd.key==='customers'?loadCustomers(rows||[]).length:loadCatalog(rows||[]).length;if(!n)return reply('He abierto el archivo, pero no reconozco sus columnas.');
        await store.update(s=>{s.settings[cmd.key]={type:'file',path:p};return s});return reply('Listo: '+(cmd.key==='customers'?'lista de clientes':'catálogo')+' cargado con '+n+' registros.');
      }
      if(cmd.type==='set'){await store.update(s=>{s.settings[cmd.key]=cmd.value;return s});return reply('Configuración guardada.')}
      if(cmd.type==='scan'){const sc=await scan();await checkReplies();const s=await store.load(),pend=Object.values(s.orders).filter(o=>!FINAL.has(o.status));return reply('He revisado '+sc.accounts+' cuenta'+(sc.accounts===1?'':'s')+' de correo. Pedidos nuevos: '+sc.found.length+(sc.errors.length?'\n⚠ '+sc.errors.join('\n⚠ '):'')+'\n\n'+(pend.length?pend.slice(0,20).map(summary).join('\n'):'No hay pedidos pendientes.'))}
      const s=await store.load();
      if(cmd.type==='list'){let os=Object.values(s.orders);if(cmd.filter==='pendiente')os=os.filter(o=>!FINAL.has(o.status));else if(cmd.filter!=='todos')os=os.filter(o=>o.status===cmd.filter);return reply(os.length?os.sort((a,b)=>a.seq-b.seq).slice(0,30).map(summary).join('\n'):'No hay pedidos en esa lista.')}
      if(cmd.type==='detail'){const o=pick(s,cmd.n);return reply(o?detail(o):'No encuentro el pedido #'+cmd.n+'.')}
      if(cmd.type==='status'){const mu=await monthUsage(),os=Object.values(s.orders),count=k=>os.filter(o=>o.status===k).length;return reply((mu.limit!=null?'Este mes: '+mu.used+' de '+mu.limit+' pedidos.\n':'')+'Pedidos: '+os.length+' · listos '+count('listo')+' · faltan datos '+count('falta_datos')+' · revisar '+count('revisar')+' · esperando cliente '+count('esperando_cliente')+' · introducidos '+count('introducido')+'.\nDestino: '+(s.settings.destination?.type||'sin configurar')+' · modo: '+s.settings.mode)}
      if(cmd.type==='discard'){const o=pick(s,cmd.n);if(!o)return reply('No encuentro el pedido #'+cmd.n+'.');await store.update(x=>{x.orders[o.id].status='descartado';history(x.orders[o.id],'discard','Descartado por la persona');return x});return reply('Pedido #'+cmd.n+' descartado.')}
      if(cmd.type==='request'){const targets=cmd.n?[pick(s,cmd.n)].filter(Boolean):Object.values(s.orders).filter(o=>o.status==='falta_datos');if(!targets.length)return reply('No hay pedidos con datos por pedir.');const done=[];for(const o of targets){const r=await requestMissing(o);if(r.ok)done.push('#'+o.seq+' → '+r.to);else if(r.reason==='cancelado')return reply('Perfecto, no he escrito a nadie.')}return reply(done.length?'Petición enviada:\n'+done.join('\n'):'No he enviado nada.')}
      if(cmd.type==='deliver'){if(!s.settings.destination)return reply('Primero configura el destino. Escribe «ayuda» para ver ejemplos.');const ids=cmd.n?[pick(s,cmd.n)?.id].filter(Boolean):Object.values(s.orders).filter(o=>o.status==='listo'||o.status==='revisar').map(o=>o.id);if(!ids.length)return reply('No hay pedidos preparados para entregar.');const r=await deliverBatch(ids);if(r.reason==='cancelado')return reply('No he entregado nada.');if(r.reason==='preparar')return reply('Estás en modo solo preparar. Cambia a «modo: pedir permiso» o «modo: automático» para entregar.');const ok=r.res.filter(x=>x.r.ok).length;return reply('Entregados '+ok+' pedido'+(ok===1?'':'s')+'.'+r.res.filter(x=>!x.r.ok).map(x=>'\n❌ #'+x.o.seq+': '+x.r.error).join(''))}
      return reply('Escribe «ayuda» para ver qué puedes pedirle al agente Pedidos.');
    }catch(e){await audit('orders.error',clean(e?.message,160));return reply('No he podido completar esa acción: '+clean(e?.message||e,180)+'. No se ha entregado ni enviado nada.')}
  }
  return {monthUsage,handleChat,tick,scan,checkReplies,requestMissing,deliverBatch,processAuto,store,_x:{ingest,lists,autoEligible}};
}
module.exports={linesFromRows,crossCheck,createOrders,parseCommand,validateExtraction,verifyOrder,matchCustomer,matchLine,loadCustomers,loadCatalog,buildFile,deliverToFile,deliverToWebhook,orderRows,DEFAULTS,parseQty,nameSim};
