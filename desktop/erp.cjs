'use strict';
// Conectores de VentaNexIA con los programas de gestión más habituales en pymes españolas.
// Cada conector hace tres cosas: LEER clientes, LEER artículos con precio y stock, y CREAR el pedido.
// No hay dependencias de Electron: el fetch se inyecta (así se prueba entero con respuestas simuladas).
//
// Fuentes (documentación oficial o cliente oficial): Holded (developers.holded.com y help.holded.com), Odoo (JSON-2 API, Odoo 19 y
// external_rpc_api), Dolibarr (wiki: módulo API REST), Software del Sol (FACTUSOL_Importacion_Excel_Calc.pdf, versión 2023 EV),
// WooCommerce REST API v3. Ningún conector se ha probado todavía contra una cuenta real: ver LEEME.
const {zipSync,strToU8}=require('fflate');

const clean=(v,n=300)=>String(v==null?'':v).replace(/\s+/g,' ').trim().slice(0,n);
const num=v=>{const n=typeof v==='number'?v:Number(String(v==null?'':v).replace(',','.'));return Number.isFinite(n)?n:null};
const cut=(s,n)=>{s=String(s||'');return s.length>n?s.slice(0,n-1)+'…':s};
const stripEs=v=>{const s=String(v||'').replace(/[\s.-]/g,'').toUpperCase();return /^ES[A-Z0-9]{9}$/.test(s)?s.slice(2):s};
const CUST_HEAD=['Código','Razón social','CIF/NIF','Email','Teléfono','Dirección'];
const CAT_HEAD=['Referencia','Descripción','Precio','Stock'];

async function http(f,url,{method='GET',headers={},body,timeout=25000,what='el programa'}={}){
  const ac=new AbortController();const t=setTimeout(()=>ac.abort(),timeout);
  try{
    const r=await f(url,{method,headers:{Accept:'application/json',...(body!==undefined?{'Content-Type':'application/json'}:{}),...headers},body:body!==undefined?JSON.stringify(body):undefined,signal:ac.signal});
    const text=await r.text().catch(()=>'');let j=null;try{j=text?JSON.parse(text):null}catch{}
    if(!r.ok){
      const detail=j?.error?.message||j?.message||j?.error?.data?.message||(typeof j?.error==='string'?j.error:'')||text;
      const e=new Error(r.status===401||r.status===403?'Clave o permisos incorrectos en '+what+' ('+r.status+')':what+' respondió '+r.status+(detail?': '+cut(String(detail).replace(/\s+/g,' '),140):''));
      e.status=r.status;throw e;
    }
    return j;
  }catch(e){
    if(e.name==='AbortError')throw new Error(what+' tarda demasiado en responder');
    if(!e.status&&/fetch failed|ENOTFOUND|ECONN|EAI_AGAIN|certificate/i.test(String(e.message)))throw new Error('No puedo conectar con '+what+': revisa la dirección ('+cut(e.message,60)+')');
    throw e;
  }finally{clearTimeout(t)}
}
const baseUrl=u=>String(u||'').trim().replace(/\/+$/,'');
function secureRemoteUrl(u,what){const v=baseUrl(u);let x;try{x=new URL(v)}catch{throw new Error('La dirección de '+what+' no es válida')}if(x.protocol!=='https:')throw new Error('Por seguridad, la dirección de '+what+' debe empezar por https://');return v}
const unix=d=>Math.floor((d?new Date(d).getTime():Date.now())/1000);

// ------------------------------------------------------------------ HOLDED (clave de API)
function holded(cfg,{fetch:f}){
  const API='https://api.holded.com/api/invoicing/v1/';
  const H={key:cfg.key};
  const get=(p)=>http(f,API+p,{headers:H,what:'Holded'});
  async function pages(path){
    const out=[];let prev=null;
    for(let page=1;page<=40;page++){
      const arr=await get(path+(path.includes('?')?'&':'?')+'page='+page);
      if(!Array.isArray(arr)||!arr.length)break;
      const first=arr[0]?.id;if(first&&first===prev)break;prev=first;out.push(...arr);
      if(arr.length<50)break;   // una página corta es la última
    }
    return out;
  }
  return {
    id:'holded',
    async test(){const c=await get('contacts?page=1');if(!Array.isArray(c))throw new Error('Holded no ha devuelto la lista de contactos');return {ok:true}},
    async customers(){
      const list=await pages('contacts');
      return [CUST_HEAD,...list.filter(c=>c&&c.name).map(c=>[c.id,c.name||c.tradeName,c.code||'',c.email||'',c.phone||c.mobile||'',[c.billAddress?.address,c.billAddress?.postalCode,c.billAddress?.city].filter(Boolean).join(', ')])];
    },
    async catalog(){
      const list=await pages('products');
      return [CAT_HEAD,...list.filter(p=>p&&(p.sku||p.name)).map(p=>[p.sku||'',p.name||'',num(p.price)??'',p.stock==null?'':num(p.stock)??''])];
    },
    async createOrder(order,ctx){
      const c=order.extracted.customer,m=order.verification?.customer;
      const known=m?.status==='conocido'?m.match:null;
      const items=order.extracted.lines.map((l,i)=>{
        const cat=ctx.lineMatch(i);const price=l.price!=null?l.price:(cat?.price!=null?num(cat.price):null);
        return {name:l.description||cat?.description||l.ref||'Artículo',units:l.qty,...(l.ref?{sku:l.ref}:{}),subtotal:price==null?0:price,...(cfg.tax!=null?{tax:cfg.tax}:{})};
      });
      const body={
        ...(known?{contactId:String(known.code)}:{}),
        ...(!known?{contactName:c.name||order.source.from||'Cliente',contactCode:c.taxId||'',contactEmail:c.email||'',contactAddress:c.address||'',contactCountryCode:'ES'}:{}),
        date:unix(order.extracted.orderDate&&/^\d{4}-\d{2}-\d{2}/.test(order.extracted.orderDate)?order.extracted.orderDate:null),
        desc:'Pedido '+order.internalRef+(order.extracted.orderRef?' · ref. cliente '+order.extracted.orderRef:''),
        notes:'VentaNexIA '+order.internalRef+(order.extracted.orderRef?' · ref. cliente '+order.extracted.orderRef:'')+(c.deliveryAddress?' · entrega: '+c.deliveryAddress:'')+(ctx.leadTime?' · plazo: '+ctx.leadTime:'')+(order.extracted.notes?' · '+order.extracted.notes:''),
        items,currency:order.extracted.currency||'EUR',
        ...(c.deliveryAddress?{shippingAddress:c.deliveryAddress}:{})
      };
      const r=await http(f,API+'documents/salesorder',{method:'POST',headers:H,body,what:'Holded'});
      if(r&&r.status===0)throw new Error('Holded no ha creado el pedido: '+(r.info||r.message||'error desconocido'));
      return {ok:true,type:'erp',program:'Holded',id:r?.id||null,number:r?.invoiceNum||r?.docNumber||null,path:'Holded · pedido de venta'+(r?.invoiceNum?' '+r.invoiceNum:'')};
    }
  };
}

// ------------------------------------------------------------------ ODOO (JSON-2 en 19+, JSON-RPC en versiones anteriores)
function odoo(cfg,{fetch:f}){
  const base=secureRemoteUrl(cfg.url,'Odoo');let mode=null,uid=null;
  async function json2(model,method,params){
    return http(f,base+'/json/2/'+model+'/'+method,{method:'POST',headers:{Authorization:'bearer '+cfg.key,...(cfg.db?{'X-Odoo-Database':cfg.db}:{}),'User-Agent':'VentaNexIA'},body:params,what:'Odoo'});
  }
  async function rpc(service,method,args){
    const r=await http(f,base+'/jsonrpc',{method:'POST',body:{jsonrpc:'2.0',method:'call',params:{service,method,args},id:Date.now()},what:'Odoo'});
    if(r?.error)throw new Error('Odoo: '+cut(r.error.data?.message||r.error.message,140));
    return r?.result;
  }
  async function detect(){
    if(mode)return mode;
    try{await json2('res.partner','search_read',{domain:[],fields:['id'],limit:1});mode='json2';return mode}
    catch(e){if(e.status===401||e.status===403)throw e}
    if(!cfg.user||!cfg.db)throw new Error('Tu Odoo no acepta la API nueva (Odoo 19). Para versiones anteriores necesito también «usuario» y «base» (nombre de la base de datos).');
    uid=await rpc('common','authenticate',[cfg.db,cfg.user,cfg.key,{}]);
    if(!uid)throw new Error('Usuario o clave de Odoo incorrectos');
    mode='rpc';return mode;
  }
  async function call(model,method,kw,pos=[]){
    await detect();
    if(mode==='json2')return json2(model,method,kw);
    return rpc('object','execute_kw',[cfg.db,uid,cfg.key,model,method,pos,kw]);
  }
  const searchRead=(model,domain,fields,limit)=>mode==='rpc'||!mode?call(model,'search_read',{fields,limit},[domain]):call(model,'search_read',{domain,fields,limit});
  async function sr(model,domain,fields,limit){await detect();return mode==='json2'?call(model,'search_read',{domain,fields,limit}):call(model,'search_read',{fields,limit},[domain])}
  return {
    id:'odoo',
    async test(){await detect();return {ok:true,version:mode==='json2'?'Odoo 19 o superior':'Odoo 14–18'}},
    async customers(){
      const r=await sr('res.partner',[['parent_id','=',false]],['id','name','vat','email','phone','street','zip','city'],3000);
      return [CUST_HEAD,...(r||[]).filter(p=>p.name).map(p=>[p.id,p.name,stripEs(p.vat||''),p.email||'',p.phone||'',[p.street,p.zip,p.city].filter(Boolean).join(', ')])];
    },
    async catalog(){
      let r;
      try{r=await sr('product.product',[['sale_ok','=',true]],['default_code','name','list_price','free_qty'],6000)}
      catch{r=await sr('product.product',[['sale_ok','=',true]],['default_code','name','list_price'],6000)}
      return [CAT_HEAD,...(r||[]).filter(p=>p.default_code).map(p=>[p.default_code,p.name,num(p.list_price)??'',p.free_qty==null?'':num(p.free_qty)??''])];
    },
    async createOrder(order,ctx){
      const c=order.extracted.customer,m=order.verification?.customer;
      let partner=m?.status==='conocido'?Number(m.match.code):null;
      if(!partner){
        const v={name:c.name||order.source.from||'Cliente',company_type:'company',...(c.taxId?{vat:c.taxId}:{}),...(c.email?{email:c.email}:{}),...(c.phone?{phone:c.phone}:{}),...(c.address?{street:c.address}:{})};
        const cr=await call('res.partner','create',{vals_list:[v]},[[v]]);
        partner=Array.isArray(cr)?cr[0]:cr;
      }
      const refs=order.extracted.lines.map(l=>l.ref).filter(Boolean);
      const prod={};
      if(refs.length){const r=await sr('product.product',[['default_code','in',refs]],['id','default_code'],refs.length*3);for(const p of r||[])prod[String(p.default_code).toUpperCase().replace(/[^A-Z0-9]/g,'')]=p.id}
      const lines=order.extracted.lines.map((l,i)=>{
        const cat=ctx.lineMatch(i);const price=l.price!=null?l.price:(cat?.price!=null?num(cat.price):null);const pid=prod[String(l.ref||'').toUpperCase().replace(/[^A-Z0-9]/g,'')];
        return [0,0,{...(pid?{product_id:pid}:{}),name:l.description||cat?.description||l.ref||'Artículo',product_uom_qty:l.qty,...(price!=null?{price_unit:price}:{})}];
      });
      const vals={partner_id:partner,client_order_ref:order.extracted.orderRef||order.internalRef,note:'VentaNexIA '+order.internalRef+(c.deliveryAddress?' · Entrega: '+c.deliveryAddress:'')+(ctx.leadTime?' · Plazo: '+ctx.leadTime:''),order_line:lines};
      const cr=await call('sale.order','create',{vals_list:[vals]},[[vals]]);const id=Array.isArray(cr)?cr[0]:cr;
      if(!id)throw new Error('Odoo no ha devuelto el número interno del pedido');
      if(cfg.confirm)try{await call('sale.order','action_confirm',{},[[id]])}catch(e){throw new Error('El pedido se creó en Odoo, pero no se pudo confirmar: '+e.message)}
      let name=null;try{name=(await sr('sale.order',[['id','=',id]],['name'],1))?.[0]?.name}catch{}
      return {ok:true,type:'erp',program:'Odoo',id,number:name,path:'Odoo · '+(cfg.confirm?'pedido':'presupuesto')+(name?' '+name:'')};
    }
  };
}

// ------------------------------------------------------------------ DOLIBARR
function dolibarr(cfg,{fetch:f}){
  let base=secureRemoteUrl(cfg.url,'Dolibarr');if(!/\/api\/index\.php$/i.test(base))base+='/api/index.php';
  const H={DOLAPIKEY:cfg.key};
  const get=p=>http(f,base+'/'+p,{headers:H,what:'Dolibarr'});
  async function pages(resource){
    const out=[],limit=500;
    for(let page=0;page<40;page++){
      const sep=resource.includes('?')?'&':'?';
      const batch=await get(resource+sep+'limit='+limit+'&page='+page);
      if(!Array.isArray(batch)||!batch.length)break;
      out.push(...batch);
      if(batch.length<limit)break;
    }
    return out;
  }
  return {
    id:'dolibarr',
    async test(){const r=await get('thirdparties?limit=1');if(!Array.isArray(r))throw new Error('Dolibarr no ha devuelto clientes: ¿está activado el módulo API REST?');return {ok:true}},
    async customers(){
      const list=await pages('thirdparties?sortfield=t.rowid&sortorder=ASC');
      return [CUST_HEAD,...list.filter(c=>c&&c.name).map(c=>[c.id,c.name||'',c.idprof1||'',c.email||'',c.phone||'',[c.address,c.zip,c.town].filter(Boolean).join(', ')])];
    },
    async catalog(){
      const list=await pages('products?sortfield=t.rowid&sortorder=ASC');
      return [CAT_HEAD,...list.filter(p=>p&&p.ref).map(p=>[p.ref,p.label||'',num(p.price)??'',p.stock_reel==null?'':num(p.stock_reel)??''])];
    },
    async createOrder(order,ctx){
      const c=order.extracted.customer,m=order.verification?.customer;
      let socid=m?.status==='conocido'?Number(m.match.code):null;
      if(!socid){
        const r=await http(f,base+'/thirdparties',{method:'POST',headers:H,what:'Dolibarr',body:{name:c.name||order.source.from||'Cliente',client:1,code_client:'auto',country_code:'ES',...(c.taxId?{idprof1:c.taxId}:{}),...(c.email?{email:c.email}:{}),...(c.phone?{phone:c.phone}:{}),...(c.address?{address:c.address}:{})}});
        socid=Number(r);if(!socid)throw new Error('Dolibarr no ha creado el cliente nuevo: créalo en Dolibarr y vuelve a introducir el pedido');
      }
      const refs=[...new Set(order.extracted.lines.map(l=>String(l.ref||'').trim()).filter(Boolean))];
      const productIds={};
      for(const ref of refs){
        try{
          const found=await get('products?sqlfilters=' + encodeURIComponent("(t.ref:=:'"+ref.replace(/'/g,"''")+"')") + '&limit=2');
          const p=Array.isArray(found)?found[0]:null;if(p?.id)productIds[ref]=Number(p.id);
        }catch{}
      }
      const lines=order.extracted.lines.map((l,i)=>{
        const cat=ctx.lineMatch(i),price=l.price!=null?l.price:(cat?.price!=null?num(cat.price):0),ref=String(l.ref||'').trim();
        return {desc:l.description||cat?.description||ref||'Artículo',qty:l.qty,subprice:price||0,tva_tx:cfg.tax??21,...(productIds[ref]?{fk_product:productIds[ref]}:{}),...(ref?{ref}:{}),rang:i+1};
      });
      const id=await http(f,base+'/orders',{method:'POST',headers:H,what:'Dolibarr',body:{socid,date:unix(),type:0,ref_client:order.extracted.orderRef||order.internalRef,
        note_private:'VentaNexIA '+order.internalRef+(c.deliveryAddress?' · entrega: '+c.deliveryAddress:'')+(ctx.leadTime?' · plazo: '+ctx.leadTime:''),lines}});
      if(!id)throw new Error('Dolibarr no ha devuelto el ID del pedido');
      let ref=null;try{ref=(await get('orders/'+id))?.ref}catch{}
      return {ok:true,type:'erp',program:'Dolibarr',id:String(id),number:ref,path:'Dolibarr · pedido'+(ref?' '+ref:'')};
    }
  };
}

// ------------------------------------------------------------------ WOOCOMMERCE (solo lectura: pedidos web)
function woocommerce(cfg,{fetch:f}){
  const base=secureRemoteUrl(cfg.url,'WooCommerce');
  const auth='Basic '+Buffer.from(cfg.key+':'+cfg.secret).toString('base64');
  const get=p=>http(f,base+'/wp-json/wc/v3/'+p,{headers:{Authorization:auth},what:'WooCommerce'});
  return {
    id:'woocommerce',
    async test(){const r=await get('orders?per_page=1');if(!Array.isArray(r))throw new Error('WooCommerce no ha devuelto pedidos');return {ok:true}},
    async orders({sinceMs}){
      const after=new Date(sinceMs).toISOString();const all=[],allowed=new Set(Array.isArray(cfg.statuses)&&cfg.statuses.length?cfg.statuses:['processing','on-hold','pending']);
      for(let page=1;page<=10;page++){const r=await get('orders?per_page=100&page='+page+'&after='+encodeURIComponent(after));if(!Array.isArray(r)||!r.length)break;all.push(...r);if(r.length<100)break}
      return all.filter(o=>allowed.has(String(o.status||'').toLowerCase())).map(o=>({id:String(o.id),account:'woocommerce',name:'#'+o.number,createdAt:o.date_created_gmt?o.date_created_gmt+'Z':o.date_created,email:o.billing?.email||'',phone:o.billing?.phone||'',note:o.customer_note||'',customerName:[o.billing?.first_name,o.billing?.last_name].filter(Boolean).join(' '),company:o.billing?.company||'',
        shippingAddress:[o.shipping?.company,o.shipping?.address_1,[o.shipping?.postcode,o.shipping?.city].filter(Boolean).join(' ')].filter(Boolean).join(', '),billingAddress:[o.billing?.company,o.billing?.address_1,[o.billing?.postcode,o.billing?.city].filter(Boolean).join(' ')].filter(Boolean).join(', '),currency:o.currency||'EUR',total:num(o.total),
        lines:(o.line_items||[]).map(l=>({sku:l.sku||'',title:l.name||'',qty:l.quantity,price:num(l.price)}))}));
    }
  };
}

// ------------------------------------------------------------------ XLSX mínimo (para los archivos de importación de Factusol)
function colIndex(s){let n=0;for(const c of String(s)){n=n*26+(c.charCodeAt(0)-64)}return n-1}
function colName(n){let s='';n++;while(n){const r=(n-1)%26;s=String.fromCharCode(65+r)+s;n=Math.floor((n-1)/26)}return s}
function xml(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]))}
function sheetXml(rows){let max=0;const rr=rows.map((row,ri)=>{let cc='';for(let ci=0;ci<row.length;ci++){const v=row[ci];if(v===null||v===undefined||v==='')continue;max=Math.max(max,ci);const r=colName(ci)+(ri+1);if(typeof v==='number'&&Number.isFinite(v))cc+='<c r="'+r+'"><v>'+v+'</v></c>';else cc+='<c r="'+r+'" t="inlineStr"><is><t>'+xml(v)+'</t></is></c>'}return '<row r="'+(ri+1)+'">'+cc+'</row>'}).join('');return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:'+colName(max)+Math.max(1,rows.length)+'"/><sheetData>'+rr+'</sheetData></worksheet>'}
function writeXlsx(rows){
  const files={
    '[Content_Types].xml':strToU8('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'),
    '_rels/.rels':strToU8('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
    'xl/workbook.xml':strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Hoja1" sheetId="1" r:id="rId1"/></sheets></workbook>'),
    'xl/_rels/workbook.xml.rels':strToU8('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'),
    'xl/worksheets/sheet1.xml':strToU8(sheetXml(rows))
  };
  return Buffer.from(zipSync(files,{level:6}));
}

// ------------------------------------------------------------------ FACTUSOL / Software del Sol: archivos de importación PCL, LPC y CLI
// Estructura según «Instrucciones para la importación de datos desde Excel/Calc», FACTUSOL versión 2023 EV (columnas por letra).
const f2=n=>Math.round((n+Number.EPSILON)*100)/100;
function ddmmyyyy(iso){const m=String(iso||'').match(/^(\d{4})-(\d{2})-(\d{2})/);if(m)return m[3]+'/'+m[2]+'/'+m[1];const d=new Date();return String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')+'/'+d.getFullYear()}
function rowOf(map,width){const r=new Array(width).fill(null);for(const [k,v] of Object.entries(map))r[colIndex(k)]=v;return r}
function splitAddress(a=''){const m=String(a).match(/^(.*?)[,\s]+(\d{5})\s+([^,]+?)(?:\s*,\s*(.+))?$/);return m?{street:m[1].trim(),zip:m[2],city:m[3].trim(),province:(m[4]||'').trim()}:{street:String(a).trim(),zip:'',city:'',province:''}}
const PCL_HEAD={A:'Tipo de documento',B:'Número de documento',C:'Referencia',D:'Fecha',G:'Código de cliente',H:'Nombre del cliente',I:'Domicilio del cliente',J:'Población',K:'Código postal',L:'Provincia',M:'N.I.F.',N:'Tipo de IVA',O:'Recargo de equivalencia',P:'Teléfono del cliente',Q:'Estado',R:'Almacén',S:'Importe neto 1',AT:'Base imponible 1',AW:'Porcentaje de IVA 1',AZ:'Importe de IVA 1',BK:'Total',BM:'Plazo de entrega',BP:'1ª línea de observaciones',BQ:'2ª línea de observaciones',BT:'Anotaciones privadas',CL:'País del cliente'};
const LPC_HEAD={A:'Tipo de documento',B:'Número de documento',C:'Posición de la línea',D:'Artículo',E:'Descripción',F:'Cantidad',J:'Precio del artículo',K:'Total',L:'Pendiente',M:'Tipo de IVA'};
const CLI_HEAD={A:'Código',C:'NIF',D:'Nombre fiscal',E:'Nombre comercial',F:'Domicilio',G:'Población',H:'Código postal',I:'Provincia',J:'País',K:'Teléfono',N:'Persona de contacto',AP:'E-mail',AT:'Observaciones'};
function buildFactusol(orders,{serie=1,start=900000,almacen='GEN',iva=21,customers=[],lineMatch}){
  const pcl=[rowOf(PCL_HEAD,colIndex('CL')+1)],lpc=[rowOf(LPC_HEAD,colIndex('M')+1)],cli=[rowOf(CLI_HEAD,colIndex('AT')+1)];
  let next=Math.max(0,...customers.map(c=>parseInt(c.code,10)).filter(Number.isFinite))+1;
  const assigned={};const errors=[];const docs={};
  for(const o of orders){
    const ex=o.extracted,c=ex.customer,m=o.verification?.customer;
    const docNum=start+o.seq;if(docNum>999999){errors.push(o.internalRef+': el número de documento supera 999999');continue}
    let code=null;
    if(m?.status==='conocido'){code=parseInt(m.match.code,10);if(!Number.isFinite(code)){errors.push(o.internalRef+': el código de cliente «'+m.match.code+'» no es numérico (Factusol usa códigos numéricos)');continue}}
    else{const key=(c.taxId||c.name||o.id).toUpperCase();if(!assigned[key]){assigned[key]=next++;
        const a=splitAddress(c.address||c.deliveryAddress||'');
        cli.push(rowOf({A:assigned[key],C:(c.taxId||'').slice(0,18),D:(c.name||'').slice(0,50),E:(c.name||'').slice(0,50),F:a.street.slice(0,50),G:a.city.slice(0,30),H:a.zip,I:a.province.slice(0,40),J:'España',K:(c.phone||'').slice(0,50),N:(c.contact||'').slice(0,50),AP:(c.email||'').slice(0,60),AT:'Alta automática VentaNexIA'},colIndex('AT')+1))}
      code=assigned[key]}
    const lines=ex.lines.map((l,i)=>{const cat=lineMatch(o,i);const price=l.price!=null?l.price:(cat?.price!=null?num(cat.price):0);return {ref:l.ref||'',desc:l.description||cat?.description||'',qty:l.qty,price:price||0,total:f2((price||0)*l.qty)}});
    const neto=f2(lines.reduce((s,l)=>s+l.total,0)),ivaImp=f2(neto*iva/100);
    const ad=splitAddress(c.deliveryAddress||c.address||'');
    docs[o.id]=docNum;
    pcl.push(rowOf({A:serie,B:docNum,C:((o.internalRef||'')+(ex.orderRef?' / '+ex.orderRef:'')).slice(0,50),D:ddmmyyyy(ex.orderDate),G:code,H:((m?.status==='conocido'&&m.match.name)||c.name||'').slice(0,50),I:(c.deliveryAddress||c.address||'').slice(0,100),J:ad.city.slice(0,30),K:ad.zip,L:ad.province.slice(0,40),M:(c.taxId||(m?.status==='conocido'?m.match.taxId:'')||'').slice(0,18),N:0,O:0,P:(c.phone||'').slice(0,20),Q:0,R:almacen,S:neto,AT:neto,AW:iva,AZ:ivaImp,BK:f2(neto+ivaImp),BM:(o.purchasing?.result?.leadTime||o.stock?.leadTime||'').slice(0,50),BP:('VentaNexIA '+o.internalRef).slice(0,50),BQ:(ex.orderRef?'Ref. cliente '+ex.orderRef:'').slice(0,50),BT:'Pedido recibido por '+(o.source.kind==='web'?'la tienda online':'email')+' de '+(o.source.from||'')+' · '+(o.source.subject||''),CL:'España'},colIndex('CL')+1));
    lines.forEach((l,i)=>lpc.push(rowOf({A:serie,B:docNum,C:i+1,D:l.ref.slice(0,13),E:l.desc,F:l.qty,J:l.price,K:l.total,L:l.qty,M:0},colIndex('M')+1)));
  }
  return {PCL:pcl,LPC:lpc,CLI:cli.length>1?cli:null,docs,errors};
}
const FACTUSOL_LEEME=(dir)=>'CÓMO IMPORTAR ESTOS PEDIDOS EN FACTUSOL (Software del Sol)\r\n\r\n1. Haz una copia de seguridad de tu empresa (Factusol te la recomienda antes de importar).\r\n2. Solapa Utilidades > grupo Importaciones > icono Ficheros .XLSX / .XLS.\r\n3. En Ubicación pulsa Examinar y elige esta carpeta:\r\n   '+dir+'\r\n4. En «Fila inicial» pon 2 (la fila 1 son los títulos).\r\n5. Deja marcada «Comprobar la estructura de todos los ficheros seleccionados antes de la importación».\r\n6. Marca «Pedidos de clientes» (y «Clientes» si hay un archivo CLI.xlsx con clientes nuevos) y pulsa «Comprobar ficheros». Si no da errores, pulsa Aceptar.\r\n7. Comprueba en Comercial > Ventas > Pedidos de clientes que están los pedidos.\r\n8. Vuelve a VentaNexIA y escribe «importados» para cerrar este lote.\r\n\r\nSi ves errores de estructura, guarda una captura y envíasela a VentaNexIA.\r\n';

// ------------------------------------------------------------------ catálogo de programas
const PROGRAMS={
  holded:{id:'holded',name:'Holded',kind:'api',make:holded,caps:{customers:true,catalog:true,stock:true,createOrder:true},
    how:'1) Entra en Holded > Desarrolladores > Credenciales.\n2) Crea o copia tu clave de API.\n3) Pégala aquí:  programa: holded clave TU_CLAVE\nNota: la API está en los planes de pago (no en el gratuito) y los pedidos de venta necesitan el módulo Inventario.'},
  odoo:{id:'odoo',name:'Odoo',kind:'api',make:odoo,caps:{customers:true,catalog:true,stock:true,createOrder:true},
    how:'1) En Odoo entra en tu perfil > Seguridad de la cuenta y crea una «Clave API».\n2) Pega aquí:  programa: odoo https://tuempresa.odoo.com base tuempresa clave TU_CLAVE\n   (En versiones de Odoo anteriores a la 19 añade también:  usuario tu@email.com)\nNota: en Odoo Online la API externa solo está en el plan Custom. Los pedidos se crean como presupuestos; añade «confirmar» al final para que se confirmen solos.'},
  dolibarr:{id:'dolibarr',name:'Dolibarr',kind:'api',make:dolibarr,caps:{customers:true,catalog:true,stock:true,createOrder:true},
    how:'1) En Dolibarr activa el módulo «API REST» (Inicio > Configuración > Módulos).\n2) Abre tu usuario y genera la «Clave para la API».\n3) Pega aquí:  programa: dolibarr https://tuservidor.com/dolibarr clave TU_CLAVE'},
  factusol:{id:'factusol',name:'Factusol (Software del Sol)',kind:'files',caps:{customers:true,catalog:true,stock:true,createOrder:true},
    how:'Factusol no tiene API, pero sí una importación oficial de pedidos desde Excel: VentaNexIA prepara los archivos exactos.\n1) Elige una carpeta:  programa: factusol carpeta C:\\Importar-Factusol\n2) Para comprobar clientes y stock, exporta desde Factusol a Excel (Empresa > Ficheros > Clientes > Emisión > Generar en Excel; Impresión > Ficheros > Artículos > Generar en Excel) y dime dónde están:  clientes: C:\\...\\clientes.xlsx  ·  catálogo: C:\\...\\articulos.xlsx\n   (si Factusol te da .xls, ábrelo y «Guardar como .xlsx»)\n3) Cada pedido listo se añade a los archivos PCL.xlsx y LPC.xlsx de esa carpeta; sigue las instrucciones de LEEME-IMPORTAR.txt.\nOpciones:  serie 1  ·  desde 900000  ·  almacén GEN'}
};
const STORES={woocommerce:{id:'woocommerce',name:'WooCommerce',make:woocommerce,
  how:'1) En tu WordPress: WooCommerce > Ajustes > Avanzado > API REST > Añadir clave (permisos: Lectura).\n2) Pega aquí:  tienda: woocommerce https://tutienda.com clave ck_XXXX secreto cs_XXXX'}};

// «programa: holded clave XXXX», «programa: odoo https://x.odoo.com base x usuario a@b.com clave K confirmar», «programa: factusol carpeta C:\Ruta serie 1 desde 900000 almacén GEN»
function parseArgs(text=''){
  const s=String(text).replace(/^\s*(programa|tienda|conectar)\s*[:=\-]?\s*/i,'').trim();
  const out={};
  const id=(s.match(/^([A-Za-zÁÉÍÓÚáéíóúñ]+)/)||[])[1];out.id=id?id.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''):'';
  const rest=s.slice((id||'').length).trim();
  const url=rest.match(/https?:\/\/[^\s]+/i);if(url)out.url=url[0].replace(/[),.;]+$/,'');
  const take=(re)=>{const m=rest.match(re);return m?m[1].trim():null};
  out.key=take(/(?:^|\s)(?:clave|key|token|api)\s*[:=]?\s*(\S+)/i);
  out.secret=take(/(?:^|\s)(?:secreto|secret)\s*[:=]?\s*(\S+)/i);
  out.db=take(/(?:^|\s)(?:base|bd|database)\s*[:=]?\s*(\S+)/i);
  out.user=take(/(?:^|\s)(?:usuario|user|email)\s*[:=]?\s*(\S+@\S+|\S+)/i);
  out.dir=take(/(?:^|\s)(?:carpeta|dir|ruta)\s*[:=]?\s*(.+?)(?=\s+(?:serie|desde|almac[eé]n|clave|confirmar)\b|$)/i);
  const serie=take(/(?:^|\s)serie\s*[:=]?\s*(\d+)/i);if(serie)out.serie=Number(serie);
  const desde=take(/(?:^|\s)desde\s*[:=]?\s*(\d+)/i);if(desde)out.start=Number(desde);
  const alm=take(/(?:^|\s)almac[eé]n\s*[:=]?\s*(\S+)/i);if(alm)out.almacen=alm;
  if(/(?:^|\s)confirmar\b/i.test(rest))out.confirm=true;
  for(const k of Object.keys(out))if(out[k]===null||out[k]===undefined||out[k]==='')delete out[k];
  return out;
}

module.exports={PROGRAMS,STORES,parseArgs,writeXlsx,buildFactusol,FACTUSOL_LEEME,colIndex,colName,holded,odoo,dolibarr,woocommerce,stripEs,splitAddress};
