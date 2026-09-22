'use strict';
// Agente de Pedidos: detecta pedidos en el correo del cliente (cualquier proveedor), los lee con adjuntos, comprueba cliente y
// referencias contra SUS listas, pide por email lo que falte y los entrega al programa que tenga (archivo de importación,
// webhook/API o borrador de Shopify).
//
// Reglas que no se saltan:
//  - La IA solo EXTRAE datos; nunca decide ni ejecuta. Todo dato que la IA devuelve se comprueba contra el texto original:
//    una referencia, un NIF o un email que no aparezcan literalmente en el correo se descartan (contra invenciones).
//  - El contenido del correo es de un tercero y no fiable: nunca da órdenes. Las acciones dependen solo de las reglas de aquí.
//  - Nada se crea en el programa de destino si el cliente no coincide, si alguna referencia no coincide con el catálogo o si
//    falta algún dato, salvo que la persona lo autorice pedido a pedido.
//  - Sin dependencias de Electron: correo, IA, archivos, diálogo y reloj se inyectan (así se prueba entero).
const fsp=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');

const DEFAULTS={
  mode:'ask',                    // prepare (solo preparar) · ask (pide permiso) · auto (solo si todo coincide)
  outputPreference:'program',    // program · export. Controla cómo quiere recibir el pedido ya revisado.
  autoScan:true,scanDays:14,maxPerScan:15,maxExtractionsPerDay:60,
  newCustomer:'ask',             // ask (pide permiso antes de pedir datos) · auto (pide los datos solo) · never (no da de alta)
  requiredCustomerData:['name','taxId','address','deliveryAddress','email','phone'],
  minConfidence:0.85,
  accounts:null,                 // null = todas las cuentas de correo conectadas
  destination:null,customers:null,catalog:null,signature:'',
  stock:null,stockCheck:true,     // null = se toma del catálogo si trae columna de stock
  stockAvailable:'ask',leadTime:'',purchasingEmail:'',noStock:'ask',afterPurchasing:'ask',customerMessage:'',refPrefix:'VNX-PED',erpRef:'internal',
  keywords:'pedido|pedidos|order|orders|compra|purchase|albar[aá]n|solicitud|reposici[oó]n|orden de compra|\\bpo[- ]?\\d'
};
const FIELD_LABEL={name:'Razón social o nombre',taxId:'CIF/NIF',address:'Dirección fiscal',deliveryAddress:'Dirección de entrega',email:'Email de contacto',phone:'Teléfono',contact:'Persona de contacto'};
const STATUS_TEXT={nuevo:'nuevo',sin_stock:'sin stock suficiente',esperando_compras:'esperando respuesta de Compras',listo:'listo para introducir',falta_datos:'faltan datos del cliente',revisar:'hay que revisarlo',esperando_cliente:'esperando respuesta del cliente',introducido:'introducido',error:'error al introducir',descartado:'descartado'};

function norm(v=''){return String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')}
function clean(v,n=300){return String(v==null?'':v).replace(/\s+/g,' ').trim().slice(0,n)}
function alnum(v=''){return String(v||'').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Z0-9]/g,'')}
function cut(s,n){s=String(s||'');return s.length>n?s.slice(0,n-1)+'…':s}
function id12(s){return crypto.createHash('sha1').update(String(s)).digest('hex').slice(0,12)}
function emailOf(v=''){const m=String(v).match(/[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,10}/i);return m?m[0].toLowerCase():''}
function domainOf(e=''){return String(e).split('@')[1]||''}
const TAXID=/^(?:[A-HJNP-SUVW]\d{7}[0-9A-J]|\d{8}[A-Z]|[XYZ]\d{7}[A-Z])$/;

// ------------------------------------------------------------------ almacén
function createStore(dir){
  const file=path.join(dir,'orders.json');let chain=Promise.resolve();
  const blank=()=>({version:1,seq:0,settings:{...DEFAULTS},orders:{},seen:{},extractions:{day:'',count:0}});
  async function load(){
    try{const s=JSON.parse(await fsp.readFile(file,'utf8'));const b=blank();return {...b,...s,settings:{...b.settings,...(s.settings||{})},orders:s.orders||{},seen:s.seen||{},extractions:s.extractions||b.extractions}}
    catch(e){if(e&&e.code!=='ENOENT'){try{await fsp.rename(file,file+'.corrupt-'+Date.now())}catch{}}return blank()}
  }
  function update(fn){
    const run=chain.then(async()=>{
      const s=await load();const r=await fn(s);const next=r&&typeof r==='object'?r:s;
      await fsp.mkdir(dir,{recursive:true});const tmp=file+'.tmp';await fsp.writeFile(tmp,JSON.stringify(next,null,1),'utf8');
      let err=null;for(let i=0;i<6;i++){try{await fsp.rename(tmp,file);err=null;break}catch(e){err=e;await new Promise(r=>setTimeout(r,60*(i+1)))}}
      if(err)throw err;return next;
    });
    chain=run.catch(()=>{});return run;
  }
  return {load,update,file};
}

// ------------------------------------------------------------------ tablas de clientes y catálogo
const COLS={
  code:/^(cod|codigo|id|num|numero|n[ºo]|cliente id|customer id|account)/,
  name:/(razon|nombre|cliente|empresa|denominacion|company|name|titular)/,
  taxId:/(cif|nif|vat|nie|dni|identificacion|fiscal|tax)/,
  email:/(mail|correo)/,phone:/(tel|movil|phone|fono)/,address:/(direccion|domicilio|address|calle)/,
  ref:/^(ref|referencia|sku|articulo|art[ií]culo|codigo|cod|item|producto ref|part)/,
  description:/(descripcion|denominacion|nombre|producto|articulo|description|title)/,price:/(precio|pvp|tarifa|price|importe)/,stock:/(stock|existencia|disponib|inventario|unidades en almac)/
};
function pickColumns(header,wanted){
  const h=header.map(x=>norm(x).trim());const map={};
  for(const key of wanted){const rx=COLS[key];let idx=-1;
    for(let i=0;i<h.length;i++){if(Object.values(map).includes(i))continue;if(rx.test(h[i])){idx=i;break}}
    if(idx>=0)map[key]=idx}
  return map;
}
function tableToRecords(rows,wanted){
  if(!rows||rows.length<2)return [];
  // la cabecera es la primera fila con al menos 2 columnas reconocidas
  let hi=0,best=null;
  for(let i=0;i<Math.min(rows.length,8);i++){const m=pickColumns(rows[i].map(String),wanted);if(Object.keys(m).length>=2){hi=i;best=m;break}}
  if(!best)return [];
  return rows.slice(hi+1).map(r=>{const o={};for(const [k,i] of Object.entries(best))o[k]=clean(r[i],200);return o}).filter(o=>Object.values(o).some(Boolean));
}
function loadCustomers(rows){return tableToRecords(rows,['code','name','taxId','email','phone','address']).filter(c=>c.name||c.taxId||c.email).map(c=>({...c,taxKey:alnum(c.taxId),email:c.email.toLowerCase()}))}
function loadCatalog(rows){return tableToRecords(rows,['ref','description','price','stock']).filter(c=>c.ref).map(c=>{const st=parseQty(c.stock);return {...c,refKey:alnum(c.ref),stock:c.stock===''||c.stock==null||!Number.isFinite(st)?null:st}})}

// ------------------------------------------------------------------ validación de lo que devuelve la IA
function parseQty(v){
  if(typeof v==='number')return Number.isFinite(v)?v:NaN;
  const m=String(v==null?'':v).replace(/\s/g,'').match(/^-?\d+(?:[.,]\d+)?/);
  return m?Number(m[0].replace(',','.')):NaN;
}
function validateExtraction(raw,sourceText=''){
  const out={isOrder:false,confidence:0,orderRef:null,orderDate:null,customer:{name:null,taxId:null,email:null,phone:null,address:null,deliveryAddress:null,contact:null},lines:[],notes:'',total:null,currency:null,issues:[]};
  if(!raw||typeof raw!=='object'){out.issues.push({code:'sin_respuesta',message:'La IA no devolvió datos utilizables'});return out}
  out.isOrder=raw.isOrder===true;
  let conf=Number(raw.confidence);if(!Number.isFinite(conf))conf=0.5;out.confidence=Math.max(0,Math.min(1,conf));
  out.orderRef=clean(raw.orderRef,60)||null;out.orderDate=clean(raw.orderDate,30)||null;out.notes=clean(raw.notes,500);
  out.currency=clean(raw.currency,5)||null;
  const total=parseQty(raw.total);out.total=Number.isFinite(total)?total:null;
  const S=alnum(sourceText);const c=raw.customer&&typeof raw.customer==='object'?raw.customer:{};
  for(const k of ['name','taxId','email','phone','address','deliveryAddress','contact'])out.customer[k]=clean(c[k],200)||null;
  // anti-invención: el NIF, el email y el teléfono deben aparecer literalmente en el correo
  if(out.customer.taxId){if(!S.includes(alnum(out.customer.taxId))){out.issues.push({code:'nif_no_aparece',field:'taxId',message:'El NIF/CIF indicado no aparece en el correo: se descarta'});out.customer.taxId=null}
    else if(!TAXID.test(alnum(out.customer.taxId)))out.issues.push({code:'nif_formato',field:'taxId',message:'El NIF/CIF no tiene un formato válido'})}
  if(out.customer.email){const e=emailOf(out.customer.email);if(!e||!String(sourceText).toLowerCase().includes(e)){out.issues.push({code:'email_no_aparece',field:'email',message:'El email indicado no aparece en el correo: se descarta'});out.customer.email=null}else out.customer.email=e}
  if(out.customer.phone){const d=out.customer.phone.replace(/\D/g,'');if(d.length<9||!String(sourceText).replace(/\D/g,'').includes(d.slice(-9))){out.issues.push({code:'telefono_no_aparece',field:'phone',message:'El teléfono indicado no aparece en el correo: se descarta'});out.customer.phone=null}}
  const lines=Array.isArray(raw.lines)?raw.lines.slice(0,200):[];
  let suspect=false;
  for(const l of lines){
    if(!l||typeof l!=='object')continue;
    const ref=clean(l.ref,60),desc=clean(l.description,200),qty=parseQty(l.qty);
    if(!ref&&!desc)continue;
    const line={ref:ref||null,description:desc||null,qty,unit:clean(l.unit,20)||null,price:Number.isFinite(parseQty(l.price))?parseQty(l.price):null,flags:[]};
    if(!Number.isFinite(qty)||qty<=0){line.flags.push('cantidad_no_valida');out.issues.push({code:'cantidad',message:'Cantidad no válida en «'+(ref||desc)+'»'})}
    else if(qty>10000){line.flags.push('cantidad_muy_alta');out.issues.push({code:'cantidad_alta',message:'Cantidad muy alta en «'+(ref||desc)+'»: revisar'})}
    if(ref&&!S.includes(alnum(ref))){line.flags.push('ref_no_aparece');suspect=true;out.issues.push({code:'ref_no_aparece',message:'La referencia «'+ref+'» no aparece en el correo: no se acepta'})}
    out.lines.push(line);
  }
  if(suspect)out.confidence=Math.min(out.confidence,0.4);
  if(out.isOrder&&!out.lines.length){out.issues.push({code:'sin_lineas',message:'No se han encontrado líneas de pedido'});out.confidence=Math.min(out.confidence,0.4)}
  return out;
}

// Segunda lectura, sin IA: si el adjunto es una tabla (Excel/CSV) con columnas de referencia y cantidad, se leen las líneas
// directamente. Si la IA y la tabla no coinciden, el pedido NO se da por bueno.
function linesFromRows(rows){
  if(!rows||rows.length<2)return null;
  for(let i=0;i<Math.min(rows.length,12);i++){
    const h=rows[i].map(x=>norm(x).trim());
    const ri=h.findIndex(x=>/^(ref|referencia|sku|codigo|cod|articulo|item)/.test(x)),qi=h.findIndex(x=>/^(cant|cantidad|uds|unid|unidades|qty|quantity)/.test(x));
    if(ri<0||qi<0||ri===qi)continue;
    const di=h.findIndex((x,j)=>j!==ri&&j!==qi&&/(descrip|denomin|nombre|producto|articulo)/.test(x));
    const pi=h.findIndex(x=>/(precio|pvp|tarifa|price)/.test(x));
    const out=[];
    for(const r of rows.slice(i+1)){
      const ref=clean(r[ri],60),q=parseQty(r[qi]);if(!ref||!Number.isFinite(q))continue;
      const pr=pi>=0?parseQty(r[pi]):NaN;
      out.push({ref,description:di>=0?clean(r[di],200)||null:null,qty:q,unit:null,price:Number.isFinite(pr)?pr:null,flags:[]});
    }
    return out.length?out:null;
  }
  return null;
}
function sumByRef(lines){const m={};for(const l of lines){const k=alnum(l.ref||'');m[k]=(m[k]||0)+(Number.isFinite(l.qty)?l.qty:NaN)}return m}
function crossCheck(ex,tables){
  const tl=(tables||[]).map(linesFromRows).find(Boolean);
  if(!ex.isOrder||!tl)return;
  const a=sumByRef(ex.lines),b=sumByRef(tl);
  const same=Object.keys(a).length===Object.keys(b).length&&Object.keys(b).every(k=>a[k]===b[k]);
  if(same){ex.structured=true;return}
  if(!ex.lines.length){ex.lines=tl;ex.structured=true;ex.issues=(ex.issues||[]).filter(i=>i.code!=='sin_lineas');ex.confidence=Math.max(ex.confidence,0.9);return}
  ex.issues.push({code:'tabla_no_coincide',message:'Las líneas leídas por la IA no coinciden con la tabla adjunta: revísalo'});
  ex.tableLines=tl;ex.confidence=Math.min(ex.confidence,0.4);
}

function validatePurchasing(raw,sourceText=''){
  const out={canSupply:null,leadTime:null,date:null,notes:''};
  if(!raw||typeof raw!=='object')return out;
  const cs=String(raw.canSupply||'').toLowerCase();if(['yes','no','partial'].includes(cs))out.canSupply=cs;
  const S=alnum(sourceText);
  for(const k of ['leadTime','date']){const v=clean(raw[k],60);if(v&&S.includes(alnum(v)))out[k]=v}   // el plazo o la fecha deben aparecer tal cual
  out.notes=clean(raw.notes,200);return out;
}

// ------------------------------------------------------------------ verificación contra las listas del cliente
function nameTokens(n=''){
  return norm(n).replace(/\b(s\.?l\.?u?|s\.?a\.?u?|sociedad limitada|sociedad anonima|s\.?coop|c\.?b\.?|sll)\b/g,' ').replace(/[^a-z0-9 ]/g,' ').split(/\s+/).filter(t=>t.length>1);
}
function nameSim(a,b){
  const A=new Set(nameTokens(a)),B=new Set(nameTokens(b));if(!A.size||!B.size)return 0;
  let i=0;for(const t of A)if(B.has(t))i++;return i/(A.size+B.size-i);
}
function matchCustomer(c,customers){
  if(!customers)return {status:'sin_lista'};
  const tax=alnum(c.taxId||'');
  if(tax){const m=customers.filter(x=>x.taxKey&&x.taxKey===tax);if(m.length===1)return {status:'conocido',by:'nif',match:m[0]};if(m.length>1)return {status:'ambiguo',candidates:m.slice(0,3)}}
  const em=emailOf(c.email||'');
  if(em){const m=customers.filter(x=>x.email&&x.email===em);if(m.length===1)return {status:'conocido',by:'email',match:m[0]}}
  if(c.name){const sc=customers.map(x=>({x,s:nameSim(c.name,x.name)})).filter(z=>z.s>=0.8).sort((a,b)=>b.s-a.s);
    if(sc.length===1||(sc.length>1&&sc[0].s-sc[1].s>=0.15))return {status:'conocido',by:'nombre',match:sc[0].x,score:sc[0].s};
    if(sc.length>1)return {status:'ambiguo',candidates:sc.slice(0,3).map(z=>z.x)}}
  return {status:'nuevo'};
}
function matchLine(l,catalog){
  if(!catalog)return {status:'sin_catalogo'};
  const k=alnum(l.ref||'');
  if(k){const ex=catalog.filter(c=>c.refKey===k);if(ex.length===1)return {status:'ok',match:ex[0]};if(ex.length>1)return {status:'ambigua',candidates:ex.slice(0,3)}}
  // sin coincidencia exacta: se sugiere un candidato, pero NUNCA se acepta solo
  const cand=k?catalog.filter(c=>c.refKey&&(c.refKey.endsWith(k)||k.endsWith(c.refKey)||c.refKey.replace(/^[A-Z]+/,'')===k.replace(/^[A-Z]+/,'')&&k.replace(/^[A-Z]+/,'').length>=3)).slice(0,3):[];
  return cand.length?{status:'dudosa',candidates:cand}:{status:'desconocida'};
}
function verifyOrder(order,{customers,catalog,settings,sourceFromEmail}){
  const ex=order.extracted;const issues=[...(ex.issues||[])];
  const cust=matchCustomer(ex.customer,customers);
  const lines=ex.lines.map(l=>matchLine(l,catalog));
  let priceDiff=false;
  ex.lines.forEach((l,i)=>{const cp=lines[i].status==='ok'?parseQty(lines[i].match.price):NaN;if(l.price!=null&&Number.isFinite(cp)&&cp>0&&Math.abs(l.price-cp)/cp>0.01)priceDiff=true});
  let senderOk=null;
  if(cust.status==='conocido'){const ce=cust.match.email;senderOk=ce&&sourceFromEmail?domainOf(ce)===domainOf(sourceFromEmail):null}
  const req=settings.requiredCustomerData||[];const missing=[];
  if(cust.status==='nuevo'||cust.status==='sin_lista'){for(const f of req)if(!ex.customer[f])missing.push(f)}
  else if(cust.status==='conocido'&&!ex.customer.deliveryAddress&&!cust.match.address)missing.push('deliveryAddress');
  const badLines=lines.some(l=>['desconocida','dudosa','ambigua'].includes(l.status));
  const lineFlags=ex.lines.some(l=>l.flags&&l.flags.some(f=>f!=='cantidad_muy_alta'));
  let status;
  if(!ex.lines.length||lineFlags||badLines||cust.status==='ambiguo'||ex.confidence<settings.minConfidence)status='revisar';
  else if(missing.length)status='falta_datos';
  else status='listo';
  const problems=[];
  if(cust.status==='nuevo')problems.push('cliente no encontrado en tu lista');
  if(cust.status==='ambiguo')problems.push('varios clientes posibles');
  if(cust.status==='sin_lista')problems.push('no hay lista de clientes configurada');
  if(!catalog)problems.push('no hay catálogo configurado');
  if(lines.some(l=>l.status==='desconocida'))problems.push('referencia(s) que no están en tu catálogo');
  if(lines.some(l=>l.status==='dudosa'))problems.push('referencia(s) dudosas');
  if(senderOk===false)problems.push('el remitente no coincide con el email del cliente');
  if(priceDiff)problems.push('algún precio del pedido no coincide con tu catálogo');
  if(ex.confidence<settings.minConfidence)problems.push('lectura poco fiable');
  return {customer:cust,lines,missing,senderOk,status,problems,issues};
}

// ------------------------------------------------------------------ entrega
function getPath(obj,p){return p.split('.').reduce((a,k)=>a==null?a:a[k],obj)}
const DEFAULT_COLUMNS='Pedido=internalRef;RefCliente=orderRef;Fecha=orderDate;NIF=customer.taxId;Cliente=customer.name;CodigoCliente=customer.code;Entrega=customer.deliveryAddress;Referencia=line.ref;Descripcion=line.description;Cantidad=line.qty;Precio=line.price';
function csvCell(v,delim){const s=v==null?'':String(v);return new RegExp('["\\n\\r'+delim.replace(/[|\\^\]-]/g,'\\$&')+']').test(s)?'"'+s.replace(/"/g,'""')+'"':s}
function orderRows(order,columns){
  const spec=String(columns||DEFAULT_COLUMNS).split(';').map(x=>x.trim()).filter(Boolean).map(x=>{const [h,...r]=x.split('=');return {h:h.trim(),f:r.join('=').trim()}});
  const ex=order.extracted,v=order.verification||{};
  const cust={...ex.customer,code:v.customer?.match?.code||''};
  const base={internalRef:order.internalRef||('P'+order.seq),orderRef:ex.orderRef||'',leadTime:order.purchasing?.result?.leadTime||order.stock?.leadTime||'',orderDate:ex.orderDate||order.createdDate,customer:cust,source:order.source,notes:ex.notes,newCustomer:v.customer?.status==='nuevo'?'SI':'NO',total:ex.total};
  const lines=ex.lines.length?ex.lines:[{}];
  return {headers:spec.map(s=>s.h),rows:lines.map(line=>spec.map(s=>{const g=s.f.startsWith('line.')?getPath({line},s.f):getPath({...base},s.f);return g==null?'':g}))};
}
function buildFile(order,{format='csv',columns}){
  const {headers,rows}=orderRows(order,columns);
  if(format==='json')return {ext:'json',content:JSON.stringify({pedido:order.extracted,cliente:order.verification?.customer?.status,origen:order.source,idempotencia:order.id},null,2)};
  if(format==='xml'){
    const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    return {ext:'xml',content:'<?xml version="1.0" encoding="UTF-8"?>\n<pedido id="'+esc(order.id)+'">\n'+rows.map(r=>'  <linea>'+r.map((v,i)=>'<'+headers[i].replace(/[^A-Za-z0-9_]/g,'_')+'>'+esc(v)+'</'+headers[i].replace(/[^A-Za-z0-9_]/g,'_')+'>').join('')+'</linea>').join('\n')+'\n</pedido>\n'};
  }
  const d=';';
  return {ext:'csv',content:'\uFEFF'+[headers,...rows].map(r=>r.map(v=>csvCell(v,d)).join(d)).join('\r\n')+'\r\n'};
}
async function deliverToFile(order,dest,{fs=fsp}={}){
  if(!dest.dir)throw new Error('Falta la carpeta de destino');
  await fs.mkdir(dest.dir,{recursive:true});
  const ref=alnum(order.internalRef||order.extracted.orderRef||('P'+order.seq)).slice(0,30)||('P'+order.seq);
  const f=buildFile(order,dest);const name='pedido_'+ref+'_'+order.id.slice(-6)+'.'+f.ext;  const p=path.join(dest.dir,name);
  try{await fs.access(p);return {ok:true,type:'file',path:p,duplicate:true}}catch{}   // idempotente: no se reescribe
  await fs.writeFile(p,f.content,'utf8');
  let custPath=null;
  if(order.verification?.customer?.status==='nuevo'){
    const c=order.extracted.customer;const head=['NIF','Nombre','Direccion','DireccionEntrega','Email','Telefono','Contacto'];
    const row=[c.taxId,c.name,c.address,c.deliveryAddress,c.email,c.phone,c.contact];
    custPath=path.join(dest.dir,'cliente_nuevo_'+(alnum(c.taxId||c.name||'sin_id').slice(0,20))+'.csv');
    await fs.writeFile(custPath,'\uFEFF'+[head,row].map(r=>r.map(v=>csvCell(v,';')).join(';')).join('\r\n')+'\r\n','utf8');
  }
  return {ok:true,type:'file',path:p,customerPath:custPath};
}
async function deliverToWebhook(order,dest,{fetch:doFetch}){
  if(!/^https:\/\//i.test(dest.url||''))throw new Error('El webhook debe empezar por https://');
  const ac=new AbortController();const t=setTimeout(()=>ac.abort(),20000);
  try{
    const r=await doFetch(dest.url,{method:'POST',signal:ac.signal,headers:{'Content-Type':'application/json','Idempotency-Key':order.id,...(dest.token?{Authorization:'Bearer '+dest.token}:{})},
      body:JSON.stringify({id:order.id,referenciaInterna:order.internalRef||null,pedido:order.extracted,cliente:{estado:order.verification?.customer?.status,codigo:order.verification?.customer?.match?.code||null},origen:order.source,
        stock:order.stock?order.stock.lines:null,plazo:order.purchasing?.result?.leadTime||order.stock?.leadTime||null})});
    const txt=await r.text().catch(()=>'');
    if(!r.ok)throw new Error('El destino respondió '+r.status+(txt?': '+cut(txt,120):''));
    let erp=null;try{const j=JSON.parse(txt);erp=String(j.orderNumber||j.numero||j.number||j.id||'')||null}catch{}
    return {ok:true,type:'webhook',status:r.status,erpNumber:erp};
  }finally{clearTimeout(t)}
}

// ------------------------------------------------------------------ lenguaje natural
function parseCommand(text=''){
  const raw=clean(text,1500),n=norm(raw).replace(/[¿?¡!]+/g,' ').replace(/\s+/g,' ').trim();
  if(!n)return null;
  let m;
  if(/^(ayuda|que puedes hacer|como funciona|comandos)\b/.test(n))return {type:'help'};
  // conectar el programa de gestión del cliente
  if(/^(programas|mis programas|que programas|con que programas|conectar (mi )?programa)\s*$/.test(n))return {type:'erp_list'};
  if(/^\s*programa\s*[:=]/i.test(raw))return {type:'erp',text:raw};
  if(/^\s*tienda\s*[:=]/i.test(raw))return {type:'store',text:raw};
  if(/^(desconectar|quitar|olvidar)\s+(mi\s+)?(programa|tienda)/.test(n))return {type:'erp_off'};
  if(/^(importados|he importado|ya importe|ya he importado|lote importado)\b/.test(n))return {type:'erp_batch_done'};
  // stock, Compras y aviso al cliente
  if((m=raw.match(/^\s*stock\s*[:=\-]\s*(.+)$/i))){
    const v=m[1].trim(),nv=norm(v);
    if(/^(desactivar|desactiva|no|ninguno)/.test(nv))return {type:'set',key:'stockCheck',value:false};
    if(/^(activar|activa|si|activado)/.test(nv))return {type:'set',key:'stockCheck',value:true};
    if(/^shopify/.test(nv))return {type:'set',key:'stock',value:{source:'shopify'}};
    if(/^(programa|erp|mi programa)/.test(nv))return {type:'set',key:'stock',value:{source:'erp'}};
    if(/^(webhook|api|url)\b/.test(nv)){const u=v.match(/https?:\/\/\S+/i);return {type:'set',key:'stock',value:{source:'webhook',url:u?u[0]:'',token:(v.match(/token\s*[:=]?\s*(\S+)/i)||[])[1]||''}}}
    return {type:'set',key:'stock',value:{source:'catalog'}};
  }
  if((m=n.match(/^(aviso de stock|si hay stock|con stock)\s*[:=\-]?\s*(.+)$/)))return {type:'set',key:'stockAvailable',value:/autom/.test(m[2])?'auto':/^(no\b|ninguno|sin )/.test(m[2])?'no':'ask'};
  if((m=raw.match(/^\s*plazo\s*[:=\-]\s*(.+)$/i)))return {type:'set',key:'leadTime',value:clean(m[1],80)};
  if((m=raw.match(/^\s*compras\s*[:=\-]\s*(\S+@\S+\.\S+)/i)))return {type:'set',key:'purchasingEmail',value:emailOf(m[1])};
  if((m=n.match(/^(sin stock|si no hay stock)\s*[:=\-]?\s*(.+)$/)))return {type:'set',key:'noStock',value:/autom/.test(m[2])?'auto':/permiso/.test(m[2])?'ask':'wait'};
  if((m=n.match(/^(respuesta de compras|cuando compras responda)\s*[:=\-]?\s*(.+)$/)))return {type:'set',key:'afterPurchasing',value:/solo actualizar|^actualizar/.test(m[2])?'update':/permiso/.test(m[2])?'ask':'auto'};
  if((m=raw.match(/^\s*referencia interna\s*[:=\-]\s*([A-Za-z0-9_-]{1,12})/i)))return {type:'set',key:'refPrefix',value:m[1].toUpperCase()};
  if((m=n.match(/^referencia en el sistema\s*[:=\-]?\s*(.+)$/)))return {type:'set',key:'erpRef',value:/ambas|las dos|ambos|definitiv/.test(m[1])?'both':'internal'};
  if((m=String(text||'').match(/^\s*mensaje al cliente\s*[:=\-]\s*([\s\S]+)$/i)))return {type:'set',key:'customerMessage',value:m[1].replace(/\r/g,'').trim().slice(0,1200)};   // conserva los saltos de línea
  // configuración
  if((m=raw.match(/^\s*(?:configura(?:r)?\s+)?destino\s*[:=\-]\s*(.+)$/i))){
    const v=m[1].trim(),nv=norm(v);
    if(/^shopify/.test(nv))return {type:'set',key:'destination',value:{type:'shopify_draft'}};
    if(/^(webhook|api|url)\b/.test(nv)){const u=v.match(/https?:\/\/\S+/i);return {type:'set',key:'destination',value:{type:'webhook',url:u?u[0]:'',token:(v.match(/token\s*[:=]?\s*(\S+)/i)||[])[1]||''}}}
    if(/elegir|seleccionar|examinar/.test(nv))return {type:'set',key:'destination_pick'};
    const p=v.replace(/^(archivo|carpeta|fichero)\s*(en|:)?\s*/i,'').replace(/^["']|["']$/g,'').trim();
    const fmt=/\.(xml)$/i.test(p)||/\bxml\b/i.test(v)?'xml':/\bjson\b/i.test(v)?'json':'csv';
    return {type:'set',key:'destination',value:{type:'file',dir:p.replace(/\s+(xml|json|csv)$/i,''),format:fmt}};
  }
  if((m=raw.match(/^\s*(clientes|cat[aá]logo|art[ií]culos|productos)\s*[:=\-]\s*(.+)$/i))){
    const key=/^clientes/i.test(m[1])?'customers':'catalog';const v=m[2].trim().replace(/^["']|["']$/g,'');
    if(/^shopify$/i.test(v))return {type:'set',key,value:{type:'shopify'}};
    if(/^(elegir|seleccionar|examinar)/i.test(v))return {type:'set',key:key+'_pick'};
    if(/^(ninguna?|quitar|borrar)/i.test(v))return {type:'set',key,value:null};
    return {type:'set',key,value:{type:'file',path:v}};
  }
  if((m=n.match(/^modo\s*[:=\-]?\s*(automatico|auto|pedir permiso|preguntar|solo preparar|preparar)/)))return {type:'set',key:'mode',value:/auto/.test(m[1])?'auto':/preparar$/.test(m[1])?'prepare':'ask'};
  if((m=n.match(/^salida preferida\s*[:=\-]?\s*(.+)$/)))return {type:'set',key:'outputPreference',value:/excel|pdf|imprimir|export/.test(m[1])?'export':'program'};
  if((m=n.match(/^(clientes nuevos|cliente nuevo|alta de clientes)\s*[:=\-]?\s*(.+)$/)))return {type:'set',key:'newCustomer',value:/solicit|autom|pide/.test(m[2])&&!/permiso/.test(m[2])?'auto':/no |nunca/.test(m[2])?'never':'ask'};
  if((m=n.match(/^(escaneo|revision) automatic[oa]\s*[:=\-]?\s*(activar|activa|activado|si|desactivar|desactiva|desactivado|no|pausa)/)))return {type:'set',key:'autoScan',value:/^(activ|si)/.test(m[2])};
  if((m=n.match(/^pedidos de la (tienda|web)( online)?\s*[:=\-]?\s*(activar|activa|activados|si|desactivar|desactiva|desactivados|no)/)))return {type:'set',key:'webOrders',value:/^(activ|si)/.test(m[3])};
  if((m=raw.match(/^\s*firma\s*[:=\-]\s*(.+)$/i)))return {type:'set',key:'signature',value:clean(m[1],120)};
  if((m=raw.match(/^\s*(?:usa|usar|vigila|revisa solo|solo)\s+(?:la\s+)?(?:cuenta|correo)\s+([^\s@]+@[^\s@]+\.[^\s@,]+)/i)))return {type:'set',key:'accounts',value:[m[1].toLowerCase()]};
  if(/^(todas las cuentas|vigila todas las cuentas)/.test(n))return {type:'set',key:'accounts',value:null};
  // acciones sobre un pedido
  const num=(n.match(/pedido\s*#?\s*(\d{1,5})\b/)||n.match(/#(\d{1,5})\b/)||[])[1];
  if(/^(descarta|ignora|borra|elimina|cancela)\b/.test(n)&&num)return {type:'discard',n:Number(num)};
  if(/^(comprueba|revisa|mira|verifica|consulta)\b.*\bstock\b/.test(n))return {type:'stock',n:num?Number(num):null};
  if(/^(consulta|pregunta|escribe|avisa|pide|manda|envia)\b.*\bcompras\b/.test(n))return {type:'consult',n:num?Number(num):null};
  if(/^(avisa|informa|notifica|escribe|manda|envia)\b.*\b(cliente|clientes)\b/.test(n))return {type:'notify',n:num?Number(num):null};
  if(/^(pide|solicita|reclama|pidele|pedirle)\b.*\b(datos|falta|faltan)\b/.test(n)||/^(pide|solicita)\b.*\bal cliente\b/.test(n))return {type:'request',n:num?Number(num):null};
  if(/^(introduce|mete|da de alta|pasa|registra|entrega|envia|manda|vuelca|carga)\b.*\bpedido/.test(n)||/^(introduce|mete|registra)\b\s*(todos|los listos)/.test(n))return {type:'deliver',n:num?Number(num):null};
  if(/^(muestra|ver|abre|detalle|dime|explica)\b.*\bpedido\s*#?\s*\d/.test(n)||/^pedido\s*#?\s*\d+\s*$/.test(n))return {type:'detail',n:Number(num)};
  if(/^(estado|resumen)\b.*\bpedidos?\b/.test(n))return {type:'status'};
  if(/^(muestra|ver|lista|listar|dame|cuales|cuantos)\b.*\bpedidos\b/.test(n)){
    const f=/listos|preparados/.test(n)?'listo':/problema|revisar|dudos/.test(n)?'revisar':/falta|incompletos/.test(n)?'falta_datos':/esperando|respuesta/.test(n)?'esperando_cliente':/introducid|entregad/.test(n)?'introducido':/pendientes|nuevos/.test(n)?'pendiente':'todos';
    return {type:'list',filter:f};
  }
  if(/\b(pedidos|pedido)\b/.test(n)&&/^(revisa|comprueba|busca|mira|actualiza|escanea|lee|hay|comprobar|revisar|buscar|recoge|recibe|detecta)\b/.test(n))return {type:'scan'};
  if(/^(pedidos nuevos|nuevos pedidos)/.test(n))return {type:'scan'};
  return null;
}

// ------------------------------------------------------------------ fábrica
function createOrders(deps){
  const {dir,mail,extract,files,webOrders=null,erp=null,stockLookup=async()=>({}),monthlyLimit=async()=>null,webOrderLevel=async()=> 'basic',confirm,notify=()=>{},now=()=>Date.now(),audit=async()=>{},loadList=async()=>null,deliverers={},fetch:doFetch,pickFolder=async()=>null,pickFile=async()=>null,fsApi=fsp}=deps;
  const store=createStore(dir);
  const today=()=>new Date(now()).toISOString().slice(0,10);

  async function accountsToWatch(s){
    const all=await mail.accounts();const want=s.settings.accounts;
    return want&&want.length?all.filter(a=>want.includes(a.address)):all;
  }
  function candidate(meta,s,accountsSet){
    if(meta.listUnsubscribe)return false;
    if(webOrders&&s.settings.webOrders!==false&&(/@(mail\.)?shopify(mail)?\.com$/i.test(meta.fromEmail||'')||/^\[[^\]]+\]\s*(pedido|order)\s*#?\d+/i.test(meta.subject||'')))return false;   // el pedido ya llega por la tienda
    if(accountsSet.has(String(meta.fromEmail||'').toLowerCase()))return false;
    const kw=new RegExp(s.settings.keywords,'i');
    const hay=[meta.subject,meta.snippet,...(meta.attachmentNames||[])].join(' ');
    if(kw.test(hay))return true;
    return (meta.attachmentNames||[]).some(n=>/\.(pdf|xlsx?|csv)$/i.test(n));
  }
  async function buildMessage(acc,meta){
    const full=await mail.fetchFull(acc,meta.id);
    const atts=[];const notes=[];const tables=[];
    for(const a of full.attachments||[]){
      const t=await files.extract(a);
      if(t.text)atts.push({name:t.name,text:t.text});else if(t.issue)notes.push(t.name+': '+t.issue);
      if(t.rows)tables.push(t.rows);
    }
    const bodyText=String(full.text||'').slice(0,20000);
    const sourceText=[full.subject,full.from,full.to,bodyText,...atts.map(a=>a.text)].filter(Boolean).join('\n');
    return {full,atts,notes,tables,bodyText,sourceText};
  }
  async function lists(s){
    const out={customers:null,catalog:null};
    try{const c=await loadList('customers',s.settings.customers);if(c)out.customers=loadCustomers(c)}catch{}
    try{const c=await loadList('catalog',s.settings.catalog);if(c)out.catalog=loadCatalog(c)}catch{}
    return out;
  }
  const refFor=(s,seq)=>String(s.settings.refPrefix||'VNX-PED').replace(/[^A-Za-z0-9_-]/g,'').slice(0,12)+'-'+String(seq).padStart(5,'0');
  const monthOf=ms=>new Date(ms).toISOString().slice(0,7);
  async function monthUsage(){
    const s=await store.load();const m=monthOf(now());const limit=await monthlyLimit();
    const used=Object.values(s.orders).filter(o=>monthOf(o.createdAt)===m).length;
    return {used,limit,reached:limit!=null&&used>=limit};
  }
  async function reverifyAll(){
    const s=await store.load();const L=await lists(s);let n=0;
    await store.update(x=>{
      for(const o of Object.values(x.orders)){
        if(!['listo','revisar','falta_datos','nuevo'].includes(o.status)||o.request)continue;
        const v=verifyOrder(o,{...L,settings:x.settings,sourceFromEmail:o.source.fromEmail});o.verification=v;
        if(o.status!==v.status){addHistory(o,'revisado de nuevo','Estado: '+STATUS_TEXT[v.status]);o.status=v.status;n++}
        if(o.status==='listo'&&!o.purchasing)delete o.stock;   // el stock se vuelve a mirar con los datos nuevos
      }
      return x});
    return n;
  }
  function addHistory(o,event,detail){o.history=[...(o.history||[]),{at:now(),event,detail:cut(detail||'',200)}].slice(-40)}

  async function ingest(acc,meta,built,extraction){
    const s0=await store.load();
    const L=await lists(s0);
    const ex=validateExtraction(extraction,built.sourceText);
    crossCheck(ex,built.tables);
    let created=null;
    await store.update(s=>{
      s.seen[acc.address+'|'+meta.id]=ex.isOrder?'order':'not_order';
      if(!ex.isOrder)return s;
      const seq=++s.seq;const id='P-'+id12(acc.address+'|'+meta.id);
      const order={id,seq,internalRef:refFor(s,seq),internalNumber:refFor(s,seq),createdAt:now(),createdDate:today(),
        source:{kind:acc.kind,account:acc.address,messageId:meta.id,threadId:built.full.threadId||meta.threadId||null,messageIdHeader:built.full.messageIdHeader||null,from:built.full.from||meta.from,fromEmail:built.full.fromEmail||meta.fromEmail,subject:built.full.subject||meta.subject,date:built.full.date||meta.date},
        attachmentNotes:built.notes,extracted:ex,history:[]};
      order.verification=verifyOrder(order,{...L,settings:s.settings,sourceFromEmail:order.source.fromEmail});
      order.status=order.verification.status;addHistory(order,'detectado','Pedido leído del correo «'+cut(order.source.subject,60)+'»');
      s.orders[id]=order;created=order;return s;
    });
    return created;
  }

  async function ingestWeb(w){
    const s0=await store.load();const L=await lists(s0);
    const raw={isOrder:true,confidence:1,orderRef:w.name,orderDate:String(w.createdAt||'').slice(0,10)||null,currency:w.currency||null,total:w.total??null,notes:w.note||'',
      customer:{name:w.company||w.customerName||null,taxId:w.taxId||null,email:w.email||null,phone:w.phone||null,address:w.billingAddress||null,deliveryAddress:w.shippingAddress||null,contact:w.customerName||null},
      lines:(w.lines||[]).map(l=>({ref:l.sku||null,description:l.title||null,qty:l.qty,price:l.price??null}))};
    const ex=validateExtraction(raw,JSON.stringify(w));ex.structured=true;   // vienen de la API de la tienda: no hay lectura que dudar
    let created=null;
    await store.update(s=>{
      const key='web|'+w.account+'|'+w.id;s.seen[key]='order';
      const seq=++s.seq;const id='P-'+id12(key);
      const order={id,seq,internalRef:refFor(s,seq),internalNumber:refFor(s,seq),createdAt:now(),createdDate:today(),
        source:{kind:'web',store:w.store||'shopify',account:w.account,messageId:w.id,threadId:null,messageIdHeader:null,from:w.customerName||w.email||'',fromEmail:(w.email||'').toLowerCase(),subject:'Pedido web '+w.name,date:w.createdAt},
        attachmentNotes:[],extracted:ex,history:[]};
      order.verification=verifyOrder(order,{...L,settings:s.settings,sourceFromEmail:order.source.fromEmail});
      order.status=order.verification.status;addHistory(order,'detectado','Pedido de la tienda '+w.name);
      s.orders[id]=order;created=order;return s;
    });
    return created;
  }
  async function scanWeb(res){
    const s=await store.load();if(!webOrders||s.settings.webOrders===false)return;
    let list=[];
    try{list=await webOrders({sinceMs:now()-s.settings.scanDays*86400e3})}catch(e){res.errors.push('Tienda online: '+cut(String(e?.message||e),100));return}
    for(const w of list||[]){
      const cur=await store.load();if(cur.seen['web|'+w.account+'|'+w.id])continue;
      {const u=await monthUsage();if(u.reached){res.monthly=u;break}}
      try{const o=await ingestWeb(w);if(o)res.found.push(o.id)}catch(e){res.errors.push('Pedido web '+w.name+': '+cut(String(e?.message||e),100))}
    }
  }

  async function scan({force=false}={}){
    const s=await store.load();const res={found:[],notOrders:0,skipped:0,errors:[],accounts:0,limit:false,monthly:null};
    const accs=await accountsToWatch(s);res.accounts=accs.length;
    {const u=await monthUsage();if(u.reached){res.monthly=u;return res}}
    const set=new Set((await mail.accounts()).map(a=>a.address.toLowerCase()));
    for(const acc of accs){
      let metas=[];
      try{metas=await mail.listRecent(acc,{sinceMs:now()-s.settings.scanDays*86400e3,max:60})}
      catch(e){res.errors.push(acc.address+': '+cut(String(e?.message||e),100));continue}
      const st=await store.load();
      const cands=metas.filter(m=>!st.seen[acc.address+'|'+m.id]&&candidate(m,st,set)).slice(0,st.settings.maxPerScan);
      for(const meta of cands){
        const cur=await store.load();
        const c=cur.extractions.day===today()?cur.extractions.count:0;
        if(c>=cur.settings.maxExtractionsPerDay){res.limit=true;break}
        {const u=await monthUsage();if(u.reached){res.monthly=u;break}}
        try{
          const built=await buildMessage(acc,meta);
          await store.update(x=>{x.extractions={day:today(),count:(x.extractions.day===today()?x.extractions.count:0)+1};return x});
          const raw=await extract({message:{from:built.full.from,subject:built.full.subject,date:built.full.date,text:built.bodyText,attachments:built.atts,attachmentNotes:built.notes},mode:'extract'});
          const order=await ingest(acc,meta,built,raw);
          if(order)res.found.push(order.id);else res.notOrders++;
        }catch(e){res.errors.push(cut((meta.subject||meta.id)+': '+String(e?.message||e),140));res.skipped++}
      }
    }
    await scanWeb(res);
    if(res.found.length)notify('Pedidos nuevos',res.found.length+' pedido(s) detectado(s) en tu correo.');
    return res;
  }

  function label(o){
    const c=o.extracted.customer;
    return '#'+o.seq+' · '+(c.name||o.source.from||'cliente sin nombre')+' · '+o.extracted.lines.length+' línea'+(o.extracted.lines.length===1?'':'s')+(o.extracted.orderRef?' · ref. '+o.extracted.orderRef:'');
  }
  function icon(st){return {sin_stock:'📉',esperando_compras:'🛒',listo:'✅',falta_datos:'📝',revisar:'⚠️',esperando_cliente:'⏳',introducido:'📦',error:'❌',descartado:'🗑️',nuevo:'🆕'}[st]||'•'}
  function detail(o){
    const ex=o.extracted,v=o.verification||{};const c=ex.customer;
    const cust=v.customer?.status==='conocido'?'✔ cliente conocido ('+(v.customer.match.code||v.customer.match.name)+', por '+v.customer.by+')':v.customer?.status==='nuevo'?'⚠ cliente NUEVO (no está en tu lista)':v.customer?.status==='ambiguo'?'⚠ varios clientes posibles':'ℹ sin lista de clientes para comprobar';
    const pr=o.purchasing,pres=pr?.result;
    return [icon(o.status)+' Pedido #'+o.seq+' · '+(o.internalRef||'')+' · '+STATUS_TEXT[o.status],
      (o.source.kind==='web'?'Tienda online ('+(o.source.store||'web')+'): '+o.source.subject+' ('+o.source.account+')':'Correo: «'+cut(o.source.subject,80)+'» de '+(o.source.from||'')+' ('+o.source.account+')'),
      'Cliente: '+(c.name||'—')+(c.taxId?' · '+c.taxId:'')+(c.email?' · '+c.email:'')+(c.phone?' · '+c.phone:'')+'\n   '+cust,
      'Entrega: '+(c.deliveryAddress||c.address||'—'),      'Líneas:',
      ...ex.lines.map((l,i)=>'  '+(i+1)+'. '+(l.ref||'sin ref.')+' — '+(l.description||'')+' × '+(Number.isFinite(l.qty)?l.qty:'?')+(l.price!=null?' · '+l.price+' €':'')+'  '+({ok:'✔ catálogo',desconocida:'✖ no está en el catálogo',dudosa:'⚠ referencia dudosa',ambigua:'⚠ ambigua',sin_catalogo:''}[v.lines?.[i]?.status]||'')+(v.lines?.[i]?.candidates?.length?' (¿'+v.lines[i].candidates.map(x=>x.ref).join(' / ')+'?)':'')),
      ...(o.stock?['Stock ('+o.stock.source+'): '+(o.stock.lines.length?o.stock.lines.map(l=>l.ref+' '+(l.state==='ok'?'✔ hay '+(l.available+(l.reserved||0))+(l.reserved?' ('+l.reserved+' reservadas)':''):l.state==='corto'?'✖ hay '+(l.available??0)+' de '+l.needed+(l.reserved?' ('+l.reserved+' reservadas por otros pedidos)':''):'? sin dato')).join(' · '):'sin referencias')]:[]),
      ...(pr?['Compras: consulta enviada a '+pr.to+(pres?' · respondieron: '+({yes:'pueden servirlo',partial:'pueden servirlo en parte',no:'NO pueden servirlo'}[pres.canSupply]||'sin claridad')+(pres.leadTime?' · plazo '+pres.leadTime:'')+(pres.date?' · '+pres.date:''):pr.unclear?' · respuesta sin interpretar: revísala':' · esperando respuesta')]:[]),
      ...((o.notices||[]).map(n=>'Cliente avisado ('+(n.kind==='stock'?'disponibilidad':'plazo de Compras')+') en '+n.to+(n.leadTime?' · '+n.leadTime:''))),
      ...(v.missing?.length?['Faltan: '+v.missing.map(f=>FIELD_LABEL[f]||f).join(', ')]:[]),
      ...(v.problems?.length?['Avisos: '+v.problems.join('; ')]:[]),
      ...(ex.structured&&o.source.kind!=='web'?['Lectura verificada con la tabla adjunta ✔']:[]),
      ...(ex.tableLines?['La tabla adjunta dice: '+ex.tableLines.map(l=>l.ref+' × '+l.qty).join(', ')]:[]),
      ...(o.attachmentNotes?.length?['Adjuntos no leídos: '+o.attachmentNotes.join('; ')]:[]),
      ...(o.delivery?['Entrega: '+(o.delivery.ok?'hecha en '+(o.delivery.path||o.delivery.type)+(o.delivery.erpNumber?' · nº en tu programa: '+o.delivery.erpNumber:''):'falló: '+o.delivery.error)]:[])].join('\n');
  }
  const HELP='Conecta tu programa de gestión con «programas» (Holded, Odoo, Dolibarr, Factusol…) o con «programa: holded clave TU_CLAVE».\n\nDetecto pedidos en tu correo (con sus adjuntos PDF, Excel o Word), los leo, compruebo el cliente y las referencias contra tus listas, pido por email lo que falte y los entrego al programa que uses. Órdenes:\n'+
    '• «revisa los pedidos» · «muestra los pedidos pendientes» · «pedido 3»\n• «pide los datos que faltan del pedido 3» · «introduce los pedidos listos» · «descarta el pedido 3»\n'+
    'Configuración (una vez):\n• «destino: archivo en C:\\Pedidos» (CSV para importar en tu ERP; también XML o JSON) · «destino: webhook https://…» · «destino: Shopify»\n'+
    '• «clientes: C:\\datos\\clientes.xlsx» y «catálogo: C:\\datos\\articulos.csv» (exporta la lista de tu programa) · «clientes: shopify»\n'+
    'Stock y Compras (opcional):\n• «stock: catálogo» (columna de stock de tu Excel) · «stock: shopify» · «stock: webhook https://…» · «comprueba el stock»\n• «compras: compras@empresa.com» · «sin stock: consultar automáticamente | pedir permiso | dejar pendiente» · «consulta a compras»\n• «aviso de stock: automático | pedir permiso | no» · «plazo: 3 días laborables» · «avisa al cliente»\n• «respuesta de compras: crear e informar automáticamente | crear y pedir permiso | solo actualizar» · «referencia interna: VNX-PED» · «mensaje al cliente: … {plazo} {pedido}»\n'+
    '• «modo: pedir permiso» (por defecto) · «modo: automático» (solo entrega si cliente y referencias coinciden exactamente) · «modo: solo preparar»\n'+
    '• «clientes nuevos: solicitar automáticamente los datos» · «usa la cuenta pedidos@tuempresa.com»';

  async function requestMissing(order,{auto=false}={}){
    const s=await store.load();
    const o=s.orders[order.id];const v=o.verification;
    if(!v.missing.length)return {ok:false,reason:'nada'};
    const to=o.extracted.customer.email||o.source.fromEmail;if(!to)return {ok:false,reason:'sin_email'};
    const accs=await mail.accounts();const acc=accs.find(a=>a.address===o.source.account)||accs[0];if(!acc)return {ok:false,reason:'sin_cuenta'};
    const sig=s.settings.signature||'El equipo de '+(acc.address.split('@')[1]||'').replace(/\..*$/,'');
    const body='Buenos días,\n\nHemos recibido su pedido'+(o.extracted.orderRef?' '+o.extracted.orderRef:'')+' y estamos preparándolo. Para poder tramitarlo necesitamos que nos confirme los siguientes datos:\n\n'+
      v.missing.map(f=>'- '+(FIELD_LABEL[f]||f)).join('\n')+'\n\nPuede responder directamente a este correo.\n\nUn cordial saludo,\n'+sig;
    const subject=/^re:/i.test(o.source.subject)?o.source.subject:'Re: '+o.source.subject;
    if(!auto){
      const ok=await confirm({title:'Pedir datos al cliente',message:'Se enviará un email a '+to+' desde '+acc.address+'.',detail:'Asunto: '+subject+'\n\n'+body});
      if(!ok)return {ok:false,reason:'cancelado'};
    }
    const sent=await mail.send(acc,{to,subject,body,threadId:o.source.threadId,inReplyTo:o.source.messageIdHeader});
    await store.update(x=>{const y=x.orders[o.id];y.status='esperando_cliente';y.request={sentAt:now(),to,fields:[...v.missing],threadId:sent.threadId||o.source.threadId,messageIdHeader:sent.messageIdHeader||null,account:acc.address};addHistory(y,'petición enviada','Pedidos los datos: '+v.missing.join(', '));return x});
    await audit('orders.request',o.extracted.customer.name+' · '+v.missing.join(','));
    return {ok:true,to};
  }

  function mergeFill(o,fill){
    // Solo se rellenan campos que estaban vacíos y que se pidieron: nunca se sobrescribe lo que ya había.
    const ex=o.extracted;let n=0;
    for(const f of o.request?.fields||[]){
      const val=fill.customer?.[f];if(val&&!ex.customer[f]){ex.customer[f]=val;n++}
    }
    return n;
  }
  async function checkReplies(){
    const s=await store.load();const out={updated:[],waiting:0};
    const waiting=Object.values(s.orders).filter(o=>o.status==='esperando_cliente'&&o.request);
    const accs=await mail.accounts();
    for(const o of waiting){
      const acc=accs.find(a=>a.address===(o.request.account||o.source.account));if(!acc)continue;
      let replies=[];
      try{replies=await mail.listReplies(acc,{threadId:o.request.threadId,fromEmail:o.request.to,afterMs:o.request.sentAt,subjectHint:o.source.subject})}catch{continue}
      const fresh=replies.filter(r=>r&&r.id&&r.id!==(o.request.lastReplyId)&&String(r.fromEmail||'').toLowerCase()!==acc.address.toLowerCase());
      if(!fresh.length){out.waiting++;continue}
      const r=fresh[fresh.length-1];
      const atts=[];for(const a of r.attachments||[]){const t=await files.extract(a);if(t.text)atts.push({name:t.name,text:t.text})}
      const text=String(r.text||'').slice(0,12000);const source=[text,...atts.map(a=>a.text)].join('\n');
      let raw;try{raw=await extract({message:{from:r.from,subject:r.subject,date:r.date,text,attachments:atts},mode:'fill',known:o.extracted,missing:o.request.fields})}catch{out.waiting++;continue}
      const fill=validateExtraction({...raw,isOrder:true,lines:[{ref:'x',qty:1}]},source);   // solo se usa la parte del cliente (validada contra la respuesta)
      const L=await lists(s);
      await store.update(x=>{
        const y=x.orders[o.id];const n=mergeFill(y,fill);y.request.lastReplyId=r.id;
        y.verification=verifyOrder(y,{...L,settings:x.settings,sourceFromEmail:y.source.fromEmail});
        y.status=y.verification.status==='falta_datos'?'esperando_cliente':y.verification.status;
        addHistory(y,'respuesta del cliente',n+' dato(s) recibidos');out.updated.push(y.id);return x});
    }
    if(out.updated.length)notify('Respuesta de un cliente',out.updated.length+' pedido(s) actualizado(s) con los datos recibidos.');
    return out;
  }

  function autoEligible(o,s){
    const v=o.verification;
    // Solo pedidos cuya lectura se ha podido verificar (tienda online o tabla Excel/CSV adjunta). Los PDF y los textos los confirmas tú.
    return o.status==='listo'&&o.extracted.structured===true&&v.customer.status==='conocido'&&v.senderOk!==false&&v.lines.every(l=>l.status==='ok')&&!v.missing.length&&!v.problems.length&&o.extracted.confidence>=Math.max(0.9,s.settings.minConfidence)&&!(o.extracted.issues||[]).length;
  }
  async function deliverOne(id){
    const s=await store.load();const o=s.orders[id];const d=s.settings.destination;
    if(!d)throw Object.assign(new Error('Configura primero el destino'),{user:true});
    if(o.delivery?.ok)return {ok:true,already:true};
    let r;
    try{
      if(d.type==='file')r=await deliverToFile(o,d,{fs:fsApi});
      else if(d.type==='webhook')r=await deliverToWebhook(o,d,{fetch:doFetch});
      else if(d.type==='erp'||d.type==='factusol'){
        if(!deliverers[d.type])throw new Error('Destino no disponible: '+d.type);
        const L=await lists(s);
        const nv=verifyOrder(o,{...L,settings:s.settings,sourceFromEmail:o.source.fromEmail});
        if(nv.status!=='listo'){
          await store.update(x=>{const y=x.orders[id];y.verification=nv;y.status=nv.status;addHistory(y,'revisado de nuevo','Ya no coincide con los datos del programa');return x});
          throw Object.assign(new Error('Con los datos actuales de tu programa ya no está listo: '+(nv.problems.join('; ')||STATUS_TEXT[nv.status])),{revised:true});
        }
        o.verification=nv;await store.update(x=>{x.orders[id].verification=nv;return x});
        const ctx={lineMatch:i=>o.verification?.lines?.[i]?.match||null,leadTime:o.purchasing?.result?.leadTime||o.stock?.leadTime||s.settings.leadTime||'',customers:L.customers||[]};
        if(d.type==='factusol'){
          const ids=[...new Set([...((s.batches&&s.batches.factusol)||[]),o.id])];
          r=await deliverers.factusol(o,d,{...ctx,batch:ids.map(i=>s.orders[i]).filter(Boolean)});
          await store.update(x=>{x.batches=x.batches||{};x.batches.factusol=ids;return x});
        }else r=await deliverers.erp(o,d,ctx);
      }
      else if(deliverers[d.type])r=await deliverers[d.type](o,d);
      else throw new Error('Destino no disponible: '+d.type);
    }catch(e){
      if(e&&e.revised)return {ok:false,error:String(e.message)};
      await store.update(x=>{const y=x.orders[id];y.status='error';y.delivery={ok:false,error:cut(String(e?.message||e),200),at:now()};addHistory(y,'error al introducir',y.delivery.error);return x});
      return {ok:false,error:String(e?.message||e)};
    }
    await store.update(x=>{const y=x.orders[id];y.status='introducido';y.delivery={...r,at:now()};addHistory(y,'introducido','Entregado en '+(r.path||r.type));return x});
    await audit('orders.delivered','#'+o.seq+' · '+d.type);
    return {ok:true,...r};
  }
  async function deliverBatch(ids,{auto=false}={}){
    const s=await store.load();const d=s.settings.destination;
    if(!d)return {ok:false,reason:'sin_destino'};
    const os=ids.map(i=>s.orders[i]).filter(o=>o&&o.status==='listo');
    if(!os.length)return {ok:false,reason:'nada'};
    if(!auto){
      const ok=await confirm({title:'Introducir pedidos',message:'Se van a entregar '+os.length+' pedido'+(os.length===1?'':'s')+' a: '+destText(d,s)+'.',
        detail:os.map(o=>label(o)+(o.verification.customer.status==='nuevo'?'  [CLIENTE NUEVO]':'')).join('\n')});
      if(!ok)return {ok:false,reason:'cancelado'};
    }
    const res=[];for(const o of os)res.push({o,r:await deliverOne(o.id)});
    return {ok:true,res};
  }
  async function processAuto(){
    const s=await store.load();if(s.settings.mode!=='auto'||!s.settings.destination)return null;
    const webLevel=await webOrderLevel();
    const ids=Object.values(s.orders).filter(o=>autoEligible(o,s)&&(o.source?.kind!=='web'||webLevel==='auto')).map(o=>o.id);
    if(!ids.length)return null;
    const r=await deliverBatch(ids,{auto:true});
    if(r?.res?.length)notify('Pedidos introducidos',r.res.filter(x=>x.r.ok).length+' pedido(s) entregado(s) automáticamente.');
    return r;
  }

  async function tick(){
    const s=await store.load();if(!s.settings.autoScan)return null;
    const accs=await mail.accounts();if(!accs.length&&!webOrders)return null;
    const sc=await scan();const rp=await checkReplies();
    // clientes nuevos: si está en automático, se piden los datos sin preguntar
    const s2=await store.load();
    if(s2.settings.newCustomer==='auto'){
      for(const o of Object.values(s2.orders))if(o.status==='falta_datos'&&!o.request)await requestMissing(o,{auto:true}).catch(()=>null);
    }
    const sp=await stockAndPurchasing();
    await processAuto();
    return {scan:sc,replies:rp,stock:sp};
  }

  // ------------------------------------------------------------------ stock, Compras y aviso al cliente
  const signature=(s,acc)=>s.settings.signature||'El equipo de '+(acc.address.split('@')[1]||'').replace(/\..*$/,'');
  const lineText=o=>o.extracted.lines.map(l=>'- '+(l.ref||'sin ref.')+(l.description?' — '+l.description:'')+' × '+(Number.isFinite(l.qty)?l.qty:'?')).join('\n');
  async function stockMap(refs,s,L){
    const src=s.settings.stock?.source||(L.catalog&&L.catalog.some(c=>c.stock!=null)?'catalog':null);
    if(!src)return null;
    if(src==='catalog'){if(!L.catalog)return null;const m={};for(const c of L.catalog)m[c.refKey]=c.stock;return {source:'catálogo',map:m}}
    const raw=await stockLookup({refs,cfg:s.settings.stock})||{};const m={};for(const [k,v] of Object.entries(raw))m[alnum(k)]=v;
    return {source:src==='shopify'?'Shopify':'tu programa',map:m};
  }
  // Reserva: el stock que ya se ha prometido a otros pedidos listos no se vuelve a prometer.
  function evalStock(o,sm,reserved={}){
    const lines=o.extracted.lines.filter(l=>l.ref).map(l=>{
      const k=alnum(l.ref);const raw=Object.prototype.hasOwnProperty.call(sm.map,k)?sm.map[k]:undefined;
      const known=raw!=null&&Number.isFinite(raw);const res=reserved[k]||0;const av=known?raw-res:undefined;
      const state=!known?'desconocido':av>=l.qty?'ok':'corto';
      return {ref:l.ref,description:l.description||null,needed:l.qty,available:known?av:null,reserved:res,state};
    });
    return {checkedAt:now(),source:sm.source,lines,anyShort:lines.some(x=>x.state==='corto'),anyUnknown:lines.some(x=>x.state==='desconocido'),allOk:lines.length>0&&lines.every(x=>x.state==='ok'),leadTime:''};
  }
  async function consultPurchasing(id,{auto=false}={}){
    const s=await store.load();const o=s.orders[id];
    if(!o||o.status!=='sin_stock'||o.purchasing)return {ok:false,reason:'nada'};
    const to=emailOf(s.settings.purchasingEmail||'');if(!to)return {ok:false,reason:'sin_compras'};
    const accs=await mail.accounts();const acc=accs.find(a=>a.address===o.source.account)||accs[0];if(!acc)return {ok:false,reason:'sin_cuenta'};
    const short=o.stock.lines.filter(l=>l.state==='corto');
    const subject='Consulta de disponibilidad · Pedido '+o.internalRef;
    const body='Hola,\n\nNecesitamos confirmar disponibilidad para el pedido '+o.internalRef+(o.extracted.customer.name?' (cliente: '+o.extracted.customer.name+')':'')+':\n\n'+
      short.map(l=>'- '+l.ref+(l.description?' — '+l.description:'')+': necesitamos '+l.needed+', hay '+(l.available==null?'?':l.available)+', faltan '+(l.needed-(l.available||0))).join('\n')+
      '\n\n¿Pueden servirlo y en qué plazo? Respondan a este correo manteniendo el número de pedido '+o.internalRef+' en el asunto.\n\nGracias,\n'+signature(s,acc);
    if(!auto){const ok=await confirm({title:'Consultar a Compras',message:'Se enviará un email a '+to+' desde '+acc.address+' por el pedido '+o.internalRef+'.',detail:'Asunto: '+subject+'\n\n'+body});if(!ok)return {ok:false,reason:'cancelado'}}
    const sent=await mail.send(acc,{to,subject,body});
    await store.update(x=>{const y=x.orders[id];y.status='esperando_compras';y.purchasing={sentAt:now(),to,threadId:sent.threadId||null,messageIdHeader:sent.messageIdHeader||null,account:acc.address};addHistory(y,'consulta a Compras','Enviada a '+to);return x});
    await audit('orders.purchasing',o.internalRef+' → '+to);
    return {ok:true,to};
  }
  function noticeGuard(o){
    const to=emailOf(o.extracted.customer.email||'')||emailOf(o.source.fromEmail||'');
    if(!to)return {ok:false,reason:'sin_email'};
    if(!['listo','esperando_compras','introducido'].includes(o.status))return {ok:false,reason:'estado'};
    if(o.verification?.senderOk===false||o.verification?.customer?.status==='ambiguo')return {ok:false,reason:'remitente'};
    return {ok:true,to};
  }
  async function notifyCustomer(id,kind,{auto=false}={}){
    const s=await store.load();const o=s.orders[id];if(!o)return {ok:false,reason:'nada'};
    if((o.notices||[]).some(n=>n.kind===kind))return {ok:false,reason:'ya'};
    const g=noticeGuard(o);if(!g.ok)return g;
    const accs=await mail.accounts();const acc=accs.find(a=>a.address===o.source.account)||accs[0];if(!acc)return {ok:false,reason:'sin_cuenta'};
    const lead=kind==='purchasing'?(o.purchasing?.result?.leadTime||o.purchasing?.result?.date||''):(o.stock?.leadTime||s.settings.leadTime||'');
    const sig=signature(s,acc);
    const block='Pedido '+o.internalRef+(o.extracted.orderRef?' (su referencia '+o.extracted.orderRef+')':'')+':\n'+lineText(o);
    let body;
    if(s.settings.customerMessage){
      body=s.settings.customerMessage.replace(/\{plazo\}/gi,lead||'a confirmar').replace(/\{pedido\}/gi,o.internalRef).replace(/\{firma\}/gi,sig).replace(/\{lineas\}/gi,lineText(o));
      if(!/\{lineas\}/i.test(s.settings.customerMessage))body+='\n\n'+block;
    }else if(kind==='purchasing')body='Buenos días,\n\nHemos recibido su pedido y ya tenemos confirmación de nuestro proveedor.\n\n'+block+'\n\n'+(lead?'Fecha o plazo estimado de entrega: '+lead+'.':'En cuanto tengamos la fecha exacta de entrega se la comunicaremos.')+'\n\nSi algún dato no es correcto, respóndanos a este correo.\n\nUn cordial saludo,\n'+sig;
    else body='Buenos días,\n\nHemos recibido su pedido y le confirmamos que tenemos disponible todo lo solicitado.\n\n'+block+'\n\n'+(lead?'Plazo de entrega: '+lead+'.\n\n':'')+'Si algún dato no es correcto, respóndanos a este correo.\n\nUn cordial saludo,\n'+sig;
    const subject=o.source.kind!=='web'&&o.source.subject?(/^re:/i.test(o.source.subject)?o.source.subject:'Re: '+o.source.subject):'Su pedido '+o.internalRef;
    if(!auto){const ok=await confirm({title:'Avisar al cliente',message:'Se enviará un email a '+g.to+' desde '+acc.address+'.',detail:'Asunto: '+subject+'\n\n'+body});if(!ok)return {ok:false,reason:'cancelado'}}
    await mail.send(acc,{to:g.to,subject,body,threadId:o.source.threadId,inReplyTo:o.source.messageIdHeader});
    await store.update(x=>{const y=x.orders[id];y.notices=[...(y.notices||[]),{kind,at:now(),to:g.to,leadTime:lead||null}];addHistory(y,'aviso al cliente',kind==='purchasing'?'Plazo confirmado por Compras':'Disponibilidad confirmada');return x});
    await audit('orders.notice',o.internalRef+' → '+g.to);
    return {ok:true,to:g.to};
  }
  function pendings(o,s){
    const p=[];const has=k=>(o.notices||[]).some(n=>n.kind===k);
    if(o.status==='sin_stock'&&!o.purchasing&&s.settings.noStock==='ask')p.push({type:'consult',text:'consultar a Compras'});
    if(o.stock?.allOk&&s.settings.stockAvailable==='ask'&&!has('stock')&&['listo','introducido'].includes(o.status))p.push({type:'notify',kind:'stock',text:'avisar al cliente de la disponibilidad'});
    const pr=o.purchasing?.result;
    if(pr&&pr.canSupply&&pr.canSupply!=='no'&&s.settings.afterPurchasing==='ask'&&!has('purchasing'))p.push({type:'notify',kind:'purchasing',text:'avisar al cliente del plazo'});
    return p;
  }
  async function stockPass(){
    const s=await store.load();const out={checked:0,sinStock:0,ok:0,notices:0,consults:0};
    if(s.settings.stockCheck===false)return out;
    const targets=Object.values(s.orders).filter(o=>o.status==='listo'&&!o.stock&&o.extracted.lines.some(l=>l.ref));
    if(!targets.length)return out;
    const L=await lists(s);
    const refs=[...new Set(targets.flatMap(o=>o.extracted.lines.map(l=>l.ref).filter(Boolean)))];
    let sm=null;try{sm=await stockMap(refs,s,L)}catch(e){return {...out,error:cut(String(e?.message||e),100)}}
    if(!sm)return out;
    const reserved={};
    for(const o of Object.values(s.orders))if(o.stock?.allOk&&o.status==='listo')for(const l of o.stock.lines)reserved[alnum(l.ref)]=(reserved[alnum(l.ref)]||0)+l.needed;
    for(const t of targets){
      const st=evalStock(t,sm,reserved);st.leadTime=s.settings.leadTime||'';
      if(st.allOk)for(const l of st.lines)reserved[alnum(l.ref)]=(reserved[alnum(l.ref)]||0)+l.needed;
      await store.update(x=>{const y=x.orders[t.id];y.stock=st;if(st.anyShort)y.status='sin_stock';addHistory(y,'stock',st.anyShort?'Sin stock suficiente':st.allOk?'Hay stock de todo':'Stock desconocido en alguna línea');return x});
      out.checked++;
      const cur=await store.load();
      if(st.anyShort){out.sinStock++;if(cur.settings.noStock==='auto'&&cur.settings.purchasingEmail){const r=await consultPurchasing(t.id,{auto:true}).catch(()=>null);if(r?.ok)out.consults++}}
      else if(st.allOk){out.ok++;if(cur.settings.stockAvailable==='auto'){const r=await notifyCustomer(t.id,'stock',{auto:true}).catch(()=>null);if(r?.ok)out.notices++}}
    }
    return out;
  }
  async function purchasingPass(){
    const s=await store.load();const out={updated:0,unclear:0,unmatched:0};
    const waiting=Object.values(s.orders).filter(o=>o.status==='esperando_compras'&&o.purchasing);
    if(!waiting.length)return out;
    const accs=await mail.accounts();
    for(const o of waiting){      const acc=accs.find(a=>a.address===o.purchasing.account);if(!acc)continue;
      let replies=[];try{replies=await mail.listReplies(acc,{threadId:o.purchasing.threadId,fromEmail:o.purchasing.to,afterMs:o.purchasing.sentAt,subjectHint:o.internalRef})}catch{continue}
      const key=alnum(o.internalRef);
      const mine=replies.filter(r=>r&&r.id&&r.id!==o.purchasing.lastReplyId&&String(r.fromEmail||'').toLowerCase()!==acc.address.toLowerCase());
      // una respuesta solo cuenta para el pedido cuyo número interno aparece en ella
      const matched=mine.filter(r=>alnum([r.subject,r.text].join('\n')).includes(key));
      out.unmatched+=mine.length-matched.length;
      if(!matched.length)continue;
      const r=matched[matched.length-1];const text=String(r.text||'').slice(0,8000);
      let raw;try{raw=await extract({message:{from:r.from,subject:r.subject,date:r.date,text,attachments:[]},mode:'purchasing',known:{internalRef:o.internalRef,lines:o.stock?.lines||[]},missing:[]})}catch{continue}
      const res=validatePurchasing(raw,[r.subject,text].join('\n'));
      if(!res.canSupply){
        await store.update(x=>{const y=x.orders[o.id];y.purchasing.lastReplyId=r.id;y.purchasing.unclear=true;addHistory(y,'respuesta de Compras','No se ha podido interpretar: revísala');return x});
        out.unclear++;notify('Compras ha respondido','El pedido '+o.internalRef+' tiene una respuesta de Compras que no he podido interpretar: revísala.');continue;
      }
      await store.update(x=>{const y=x.orders[o.id];y.purchasing={...y.purchasing,lastReplyId:r.id,repliedAt:now(),unclear:false,result:res};
        y.status=res.canSupply==='no'?'revisar':'listo';
        if(res.canSupply==='no')y.verification.problems=[...(y.verification.problems||[]),'Compras indica que no puede servirlo'];
        addHistory(y,'respuesta de Compras',(res.canSupply==='no'?'No pueden servirlo':res.canSupply==='partial'?'Pueden servirlo en parte':'Pueden servirlo')+(res.leadTime?' · plazo '+res.leadTime:'')+(res.date?' · '+res.date:''));return x});
      out.updated++;
      if(res.canSupply!=='no'){
        const cur=await store.load();const oo=cur.orders[o.id];
        if(cur.settings.afterPurchasing==='auto')await notifyCustomer(o.id,'purchasing',{auto:true}).catch(()=>null);
        if(['auto','ask'].includes(cur.settings.afterPurchasing)&&cur.settings.destination&&autoEligible(oo,cur))await deliverBatch([o.id],{auto:true}).catch(()=>null);
      }
    }
    if(out.updated)notify('Respuesta de Compras',out.updated+' pedido(s) actualizado(s) con la respuesta de Compras.');
    return out;
  }
  async function stockAndPurchasing(){const a=await stockPass();const b=await purchasingPass();return {stock:a,purchasing:b}}

  function destText(d,s){
    if(!d)return 'sin configurar';
    if(d.type==='file')return 'archivo en '+d.dir;
    if(d.type==='webhook')return d.url;
    if(d.type==='shopify_draft')return 'borradores de Shopify';
    if(d.type==='erp')return (s?.settings?.erp?.label)||'tu programa';
    if(d.type==='factusol')return 'archivos de importación de Factusol en '+d.dir;
    return d.type;
  }
  function pick(s,n){return Object.values(s.orders).find(o=>o.seq===n)}
  function summaryLine(o,s){return icon(o.status)+' '+label(o)+' — '+STATUS_TEXT[o.status]+(o.verification?.problems?.length&&!['listo','sin_stock','esperando_compras'].includes(o.status)?' ('+o.verification.problems.slice(0,2).join('; ')+')':'')+(s&&pendings(o,s).length?'\n      ⏸ pendiente de tu permiso: '+pendings(o,s).map(x=>x.text).join(' · '):'')}

  async function handleChat(text){
    const linesIn=String(text||'').split(/\n+/).map(x=>x.trim()).filter(Boolean);
    if(linesIn.length>1){
      const cmds=linesIn.map(parseCommand);
      if(cmds.every(c=>c&&c.type==='set'&&!/_pick$/.test(c.key))){
        const outs=[];for(const l of linesIn){const r=await handleChat(l);outs.push(r?.reply||'')}
        return {reply:'Configuración guardada:\n'+outs.map(x=>'• '+x).join('\n'),source:'desktop-orders',route:'agent:orders'};
      }
    }
    const cmd=parseCommand(text);if(!cmd)return null;
    const reply=r=>({reply:r,source:'desktop-orders',route:'agent:orders'});
    try{
      const s=await store.load();
      switch(cmd.type){
        case 'help':return reply(HELP);
        case 'set':{
          if(cmd.key==='destination_pick'){const d=await pickFolder();if(!d)return reply('No se ha elegido ninguna carpeta.');cmd.key='destination';cmd.value={type:'file',dir:d,format:'csv'}}
          if(cmd.key==='customers_pick'||cmd.key==='catalog_pick'){const f=await pickFile();if(!f)return reply('No se ha elegido ningún archivo.');cmd.key=cmd.key.replace('_pick','');cmd.value={type:'file',path:f}}
          if(cmd.key==='destination'&&cmd.value?.type==='file'&&!cmd.value.dir)return reply('Indica la carpeta: «destino: archivo en C:\\Pedidos», o escribe «destino: elegir carpeta».');
          if(cmd.key==='destination'&&cmd.value?.type==='webhook'&&!/^https:\/\//i.test(cmd.value.url))return reply('El webhook tiene que ser una dirección https://… : «destino: webhook https://tu-programa.com/api/pedidos token abc123».');
          if(cmd.key==='stock'&&cmd.value?.source==='webhook'&&!/^https:\/\//i.test(cmd.value.url||''))return reply('El servicio de stock tiene que ser una dirección https://… : «stock: webhook https://tu-programa.com/api/stock token abc123».');
          if(cmd.key==='customers'||cmd.key==='catalog'){
            if(cmd.value){try{const rows=await loadList(cmd.key,cmd.value);const n=cmd.key==='customers'?loadCustomers(rows||[]).length:loadCatalog(rows||[]).length;
              if(!n)return reply('He abierto el archivo pero no he reconocido las columnas. Necesito una cabecera con '+(cmd.key==='customers'?'nombre o razón social, CIF/NIF y email':'referencia y descripción')+'.');
              await store.update(x=>{x.settings[cmd.key]=cmd.value;return x});const re=await reverifyAll();return reply('Listo: '+(cmd.key==='customers'?'lista de clientes':'catálogo')+' cargado con '+n+' registros.'+(re?' He vuelto a comprobar '+re+' pedido(s) con los datos nuevos.':''));
            }catch(e){return reply('No he podido leer ese archivo: '+cut(String(e?.message||e),140))}}
          }
          await store.update(x=>{x.settings[cmd.key]=cmd.value;return x});
          const T={
            destination:()=>cmd.value?.type==='file'?'Destino: archivo '+(cmd.value.format||'csv').toUpperCase()+' en '+cmd.value.dir+'. Cada pedido listo se guardará ahí, listo para importar en tu programa.':cmd.value?.type==='webhook'?'Destino: webhook '+cmd.value.url:'Destino: borradores de pedido en Shopify (necesita permiso de escritura de pedidos borrador).',
            mode:()=>cmd.value==='auto'?'Modo automático: solo entregaré pedidos de clientes conocidos, con todas las referencias exactas en tu catálogo y sin ningún aviso. Todo lo demás lo revisas tú.':cmd.value==='prepare'?'Modo solo preparar: leo y compruebo los pedidos, pero nunca los entrego sin que me lo ordenes.':'Modo pedir permiso: te pido confirmación antes de entregar cualquier pedido.',
            outputPreference:()=>cmd.value==='export'?'Salida preferida: los pedidos revisados se quedan preparados para exportar a Excel, PDF o imprimir; no se introducen solos en tu programa.':'Salida preferida: usar el programa de gestión conectado cuando el modo lo permita.',
            newCustomer:()=>cmd.value==='auto'?'Cuando el cliente sea nuevo, le pediré por email los datos que falten sin preguntarte.':cmd.value==='never'?'No daré de alta clientes nuevos: esos pedidos los revisas tú.':'Con un cliente nuevo te pediré permiso antes de escribirle.',
            autoScan:()=>cmd.value?'Revisión automática del correo activada (cada 15 minutos con la app abierta).':'Revisión automática desactivada.',
            signature:()=>'Firma guardada.',
            stock:()=>cmd.value.source==='catalog'?'El stock se leerá de la columna de stock de tu catálogo.':cmd.value.source==='shopify'?'El stock se leerá del inventario de Shopify.':'El stock se consultará a tu programa por webhook.',
            stockCheck:()=>cmd.value?'Comprobación de stock activada.':'Comprobación de stock desactivada: los pedidos ya no se comparan con el stock.',
            stockAvailable:()=>({auto:'Cuando haya stock de todo, avisaré al cliente por email sin preguntarte.',ask:'Cuando haya stock, prepararé el aviso al cliente y te pediré permiso.',no:'No avisaré al cliente cuando haya stock.'}[cmd.value]),
            leadTime:()=>'Plazo que indicaré al cliente cuando haya stock: «'+cmd.value+'».',
            purchasingEmail:()=>'Email de Compras: '+cmd.value+'.',
            noStock:()=>({auto:'Si falta stock, consultaré a Compras automáticamente.',ask:'Si falta stock, prepararé la consulta a Compras y te pediré permiso.',wait:'Si falta stock, dejaré el pedido pendiente sin escribir a nadie.'}[cmd.value]),
            afterPurchasing:()=>({auto:'Cuando Compras responda: crearé el pedido en tu programa (si es fiable) e informaré al cliente automáticamente.',ask:'Cuando Compras responda: crearé el pedido (si es fiable) y te pediré permiso antes de informar al cliente.',update:'Cuando Compras responda: solo actualizaré el pedido, sin crearlo ni avisar.'}[cmd.value]),
            refPrefix:()=>'Los números internos serán '+cmd.value+'-00001, '+cmd.value+'-00002…',
            erpRef:()=>cmd.value==='both'?'Guardaré el número interno y, si tu programa lo devuelve, también el número definitivo.':'Usaré siempre el número interno como referencia en tu programa.',
            customerMessage:()=>'Mensaje al cliente guardado (usa {plazo}, {pedido}, {lineas} y {firma}).',
            webOrders:()=>cmd.value?'Leeré también los pedidos de tu tienda online (Shopify).':'Ya no leeré los pedidos de la tienda online.',
            accounts:()=>cmd.value?'Solo vigilaré '+cmd.value.join(', ')+'.':'Vigilaré todas las cuentas de correo conectadas.'
          };
          const txt=T[cmd.key]?T[cmd.key]():null;
          return reply(txt||'Guardado.');
        }
        case 'scan':{
          const sc=await scan();const s2=await store.load();
          if(!sc.accounts&&!webOrders)return reply('No hay ninguna cuenta de correo conectada. Conecta una en Conexiones (Gmail o cualquier correo IMAP).');
          await checkReplies();const sp=await stockAndPurchasing();const s3=await store.load();
          const pend=Object.values(s3.orders).filter(o=>!['introducido','descartado'].includes(o.status));
          const cfg=[];if(!s3.settings.destination)cfg.push('destino');if(!s3.settings.customers)cfg.push('lista de clientes');if(!s3.settings.catalog)cfg.push('catálogo');
          return reply('He revisado '+sc.accounts+' cuenta'+(sc.accounts===1?'':'s')+' de correo. Pedidos nuevos: '+sc.found.length+(sc.errors.length?'\n⚠ '+sc.errors.slice(0,3).join('\n⚠ '):'')+(sc.limit?'\n(Límite diario de lecturas alcanzado.)':'')+(sc.monthly?'\n⛔ Has alcanzado el límite mensual de pedidos de tu plan ('+sc.monthly.used+' de '+sc.monthly.limit+'). No leeré más pedidos hasta el mes que viene; puedes ampliar tu plan.':'')+
            '\n\n'+(pend.length?'Pendientes:\n'+pend.sort((a,b)=>a.seq-b.seq).slice(0,15).map(o=>summaryLine(o,s3)).join('\n'):'No hay pedidos pendientes.')+(sp.stock.checked?'\n\nStock comprobado en '+sp.stock.checked+' pedido(s): '+sp.stock.ok+' con stock, '+sp.stock.sinStock+' sin stock suficiente'+(sp.stock.consults?' ('+sp.stock.consults+' consulta(s) enviada(s) a Compras)':'')+(sp.stock.notices?'; '+sp.stock.notices+' cliente(s) avisado(s)':'')+'.':'')+(sp.stock.error?'\n⚠ No he podido comprobar el stock: '+sp.stock.error:'')+(sp.purchasing.updated?'\nCompras ha respondido en '+sp.purchasing.updated+' pedido(s).':'')+
            (cfg.length?'\n\nPara comprobarlos y entregarlos falta configurar: '+cfg.join(', ')+'. Escribe «ayuda» para ver cómo.':''));
        }
        case 'list':{
          let os=Object.values(s.orders);
          if(cmd.filter==='pendiente')os=os.filter(o=>!['introducido','descartado'].includes(o.status));
          else if(cmd.filter!=='todos')os=os.filter(o=>o.status===cmd.filter);
          if(!os.length)return reply('No hay pedidos en esa lista. Prueba con «revisa los pedidos».');
          return reply(os.sort((a,b)=>a.seq-b.seq).slice(0,30).map(o=>summaryLine(o,s)).join('\n'));
        }
        case 'detail':{const o=pick(s,cmd.n);return reply(o?detail(o):'No encuentro el pedido #'+cmd.n+'.')}
        case 'status':{
          const os=Object.values(s.orders);const by=k=>os.filter(o=>o.status===k).length;const mu=await monthUsage();
          return reply((mu.limit!=null?'Este mes: '+mu.used+' de '+mu.limit+' pedidos de tu plan.\n':'')+'Pedidos: '+os.length+' · listos '+by('listo')+' · sin stock '+by('sin_stock')+' · esperando Compras '+by('esperando_compras')+' · faltan datos '+by('falta_datos')+' · a revisar '+by('revisar')+' · esperando cliente '+by('esperando_cliente')+' · introducidos '+by('introducido')+' · con error '+by('error')+'.\nStock: '+(s.settings.stockCheck===false?'desactivado':s.settings.stock?.source||'del catálogo si trae columna de stock')+' · Compras: '+(s.settings.purchasingEmail||'sin configurar')+' · sin stock: '+({auto:'consultar solo',ask:'pedir permiso',wait:'dejar pendiente'}[s.settings.noStock])+'\nDestino: '+destText(s.settings.destination,s)+' · modo: '+({ask:'pedir permiso',auto:'automático',prepare:'solo preparar'}[s.settings.mode])+' · salida: '+(s.settings.outputPreference==='export'?'Excel/PDF/Imprimir':'programa conectado')+' · lista de clientes: '+(s.settings.customers?'sí':'no')+' · catálogo: '+(s.settings.catalog?'sí':'no'));
        }
        case 'stock':{
          if(s.settings.stockCheck===false)return reply('La comprobación de stock está desactivada. Escribe «stock: activar» para usarla.');
          const targets=cmd.n?[pick(s,cmd.n)].filter(Boolean):Object.values(s.orders).filter(o=>['listo','sin_stock'].includes(o.status)&&!o.purchasing);
          if(!targets.length)return reply(cmd.n?'No encuentro el pedido #'+cmd.n+'.':'No hay pedidos en los que comprobar el stock.');
          await store.update(x=>{for(const o of targets){const y=x.orders[o.id];if(['listo','sin_stock'].includes(y.status)&&!y.purchasing){delete y.stock;if(y.status==='sin_stock')y.status='listo'}}return x});
          const r=await stockPass();
          if(r.error)return reply('No he podido consultar el stock: '+r.error);
          const s2=await store.load();const lines=targets.map(o=>s2.orders[o.id]).filter(o=>o.stock).map(o=>(o.stock.anyShort?'📉':o.stock.allOk?'✅':'❔')+' '+label(o)+' — '+(o.stock.anyShort?'sin stock suficiente ('+o.stock.lines.filter(l=>l.state==='corto').map(l=>l.ref+': hay '+(l.available??0)+' de '+l.needed).join(', ')+')':o.stock.allOk?'hay stock de todo':'stock desconocido en alguna línea'));
          if(!lines.length)return reply('No he podido comprobar el stock. Necesito un catálogo con columna de stock («catálogo: C:\\datos\\articulos.xlsx»), «stock: shopify» o «stock: webhook https://…».');
          return reply(lines.join('\n')+(r.consults?'\n\nHe consultado a Compras por '+r.consults+' pedido(s).':'')+(r.notices?'\nHe avisado a '+r.notices+' cliente(s).':''));
        }
        case 'consult':{
          if(!s.settings.purchasingEmail)return reply('Antes necesito el email de Compras: «compras: compras@tuempresa.com».');
          const targets=cmd.n?[pick(s,cmd.n)].filter(Boolean):Object.values(s.orders).filter(o=>o.status==='sin_stock'&&!o.purchasing);
          const todo=targets.filter(o=>o.status==='sin_stock'&&!o.purchasing);
          if(!todo.length)return reply(cmd.n?'El pedido #'+cmd.n+' no está pendiente de consultar a Compras.':'No hay pedidos sin stock pendientes de consultar.');
          const done=[];for(const o of todo){const r=await consultPurchasing(o.id);if(r.ok)done.push(o.internalRef+' → '+r.to);else if(r.reason==='cancelado')return reply(done.length?'Consulta enviada:\n'+done.join('\n'):'Perfecto, no he escrito a Compras.')}
          return reply(done.length?'Consulta enviada a Compras:\n'+done.join('\n')+'\nCuando respondan (con el número de pedido en el asunto) actualizaré el pedido y te avisaré.':'No he enviado nada.');
        }
        case 'notify':{
          const targets=(cmd.n?[pick(s,cmd.n)].filter(Boolean):Object.values(s.orders)).flatMap(o=>pendings(o,s).filter(p=>p.type==='notify').map(p=>({o,p})));
          if(!targets.length)return reply(cmd.n?'El pedido #'+cmd.n+' no tiene ningún aviso pendiente para el cliente.':'No hay avisos pendientes para los clientes.');
          const done=[];for(const t of targets){const r=await notifyCustomer(t.o.id,t.p.kind);if(r.ok)done.push(t.o.internalRef+' → '+r.to);else if(r.reason==='cancelado')return reply(done.length?'Avisos enviados:\n'+done.join('\n'):'Perfecto, no he escrito a ningún cliente.');else if(r.reason==='sin_email')done.push(t.o.internalRef+': no tengo el email del cliente')}
          return reply(done.length?'Clientes avisados:\n'+done.join('\n'):'No he enviado nada.');
        }
        case 'erp_list':{
          if(!erp)return reply('Conectar tu programa no está disponible en esta versión.');
          return reply(await erp.list());
        }
        case 'erp':{
          if(!erp)return reply('Conectar tu programa no está disponible en esta versión.');
          const r=await erp.connect(cmd.text);
          if(!r.ok)return reply(r.message);
          await store.update(x=>{const st=x.settings;
            if(r.settings?.erp?.kind==='files'){   // un programa de archivos no aporta listas: se quitan las del programa anterior
              if(st.customers?.type==='erp')st.customers=null;if(st.catalog?.type==='erp')st.catalog=null;if(st.stock?.source==='erp')st.stock=null}
            Object.assign(st,r.settings||{});return x});
          const re=await reverifyAll();
          return reply(r.message+(re?'\nHe vuelto a comprobar '+re+' pedido(s) con los datos de tu programa.':''));
        }
        case 'store':{
          if(!erp)return reply('Conectar tu tienda no está disponible en esta versión.');
          const r=await erp.connectStore(cmd.text);
          if(!r.ok)return reply(r.message);
          await store.update(x=>{x.settings.webOrders=true;return x});
          return reply(r.message);
        }
        case 'erp_off':{
          if(!erp)return reply('No hay ningún programa conectado.');
          const msg=await erp.disconnect();
          await store.update(x=>{const st=x.settings;delete st.erp;
            if(st.destination&&['erp','factusol'].includes(st.destination.type))st.destination=null;
            if(st.customers&&st.customers.type==='erp')st.customers=null;if(st.catalog&&st.catalog.type==='erp')st.catalog=null;
            if(st.stock&&st.stock.source==='erp')st.stock=null;return x});
          await reverifyAll();
          return reply(msg);
        }
        case 'erp_batch_done':{
          if(!erp||!erp.closeBatch)return reply('No hay ningún lote de importación abierto.');
          const r=await erp.closeBatch();
          await store.update(x=>{if(x.batches)x.batches.factusol=[];return x});
          return reply(r);
        }
        case 'discard':{
          const o=pick(s,cmd.n);if(!o)return reply('No encuentro el pedido #'+cmd.n+'.');
          await store.update(x=>{const y=x.orders[o.id];y.status='descartado';addHistory(y,'descartado','Descartado por la persona');return x});
          return reply('Pedido #'+cmd.n+' descartado.');
        }
        case 'request':{
          const targets=cmd.n?[pick(s,cmd.n)].filter(Boolean):Object.values(s.orders).filter(o=>o.status==='falta_datos'&&!o.request);
          if(!targets.length)return reply('No hay pedidos con datos por pedir.');
          const done=[];
          for(const o of targets){
            if(s.settings.newCustomer==='never'&&o.verification?.customer?.status==='nuevo'){continue}
            const r=await requestMissing(o);if(r.ok)done.push('#'+o.seq+' → '+r.to);else if(r.reason==='cancelado')return reply('Perfecto, no he escrito a nadie.');else if(r.reason==='sin_email')done.push('#'+o.seq+': no tengo un email al que escribir');
          }
          return reply(done.length?'Petición enviada:\n'+done.join('\n')+'\nCuando el cliente responda, completaré el pedido y te avisaré.':'No he enviado nada.');
        }
        case 'deliver':{
          if(!s.settings.destination)return reply('Antes necesito saber dónde entregar los pedidos. Escribe, por ejemplo:\n«destino: archivo en C:\\Pedidos» (un CSV para importar en tu programa)\n«destino: webhook https://…» (API de tu programa) o «destino: Shopify».');
          const ids=cmd.n?[pick(s,cmd.n)?.id].filter(Boolean):Object.values(s.orders).filter(o=>o.status==='listo').map(o=>o.id);
          if(!ids.length)return reply(cmd.n?'El pedido #'+cmd.n+' no está listo para introducir (mira «pedido '+cmd.n+'»).':'No hay pedidos listos para introducir.');
          const r=await deliverBatch(ids);
          if(r.reason==='cancelado')return reply('Perfecto, no he entregado nada.');
          if(r.reason==='nada')return reply('Ese pedido no está listo para introducir.');
          const okc=r.res.filter(x=>x.r.ok).length;
          return reply((okc?'✅ Entregados '+okc+' pedido'+(okc===1?'':'s')+'.':'')+r.res.filter(x=>!x.r.ok).map(x=>'\n❌ #'+x.o.seq+': '+x.r.error).join('')+(okc&&s.settings.destination.type==='file'?'\nEncontrarás los archivos en '+s.settings.destination.dir+'.':''));
        }
      }
    }catch(e){
      if(e&&e.user)return reply(e.message);
      await audit('orders.error',cmd.type+' · '+cut(String(e?.message||e),140));
      return reply('No he podido completar esa acción: '+cut(String(e?.message||e),160)+'. No se ha entregado ni enviado nada.');
    }
    return null;
  }
  return {destText,monthUsage,handleChat,tick,scan,checkReplies,requestMissing,deliverBatch,processAuto,store,_x:{ingest,lists,autoEligible}};
}

module.exports={validatePurchasing,linesFromRows,crossCheck,createOrders,parseCommand,validateExtraction,verifyOrder,matchCustomer,matchLine,loadCustomers,loadCatalog,buildFile,deliverToFile,deliverToWebhook,orderRows,DEFAULTS,parseQty,nameSim};