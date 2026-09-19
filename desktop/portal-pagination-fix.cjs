const {app,BrowserWindow,ipcMain}=require('electron');
const path=require('node:path');
const fs=require('node:fs/promises');
const {readState}=require('./state-store.cjs');

const norm=v=>String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const partitionFor=id=>`persist:vnx-portal-${String(id||'portal').replace(/[^a-z0-9_-]/gi,'')}`;
function sameOrigin(a,b){try{return new URL(a).origin===new URL(b).origin}catch{return false}}

function selectPortal(portals,question=''){
  const q=norm(question);
  const active=portals.filter(p=>['read','write'].includes(p.mode));
  return active.find(p=>q.includes(norm(p.name)))||active.find(p=>p.profile?.capabilities?.products)||active[0]||null;
}

function windowOptions(portal){
  return {width:1100,height:760,show:false,title:`VentaNexIA · Verificando ${portal.name}`,webPreferences:{partition:partitionFor(portal.id),contextIsolation:true,nodeIntegration:false,sandbox:true,devTools:false}};
}

async function inspectProducts(win){
  return win.webContents.executeJavaScript(`(()=>{
    const clean=s=>String(s||'').replace(/\\s+/g,' ').trim();
    const text=String(document.body?.innerText||'').slice(0,80000);
    const tables=[...document.querySelectorAll('table')].map((t,ti)=>{
      const headers=[...t.querySelectorAll('thead th')].map(x=>clean(x.innerText||x.textContent)).filter(Boolean);
      const rows=[...t.querySelectorAll('tbody tr')].map(tr=>[...tr.querySelectorAll('th,td')].map(td=>clean(td.innerText||td.textContent)).filter(Boolean)).filter(r=>r.length);
      return {index:ti,headers,rows};
    });
    const meaningful=tables.sort((a,b)=>b.rows.length-a.rows.length)[0]||{headers:[],rows:[]};
    const explicit=[
      /mostrando\\s+\\d+\\s+(?:a|hasta)\\s+\\d+\\s+de\\s+([\\d.,]+)\\s+(?:registros|resultados|entradas|items|productos)/i,
      /showing\\s+\\d+\\s+to\\s+\\d+\\s+of\\s+([\\d.,]+)\\s+(?:entries|results|items|products)/i,
      /(?:total|totales)\\s*[:\\-]?\\s*([\\d.,]+)\\s*(?:productos|registros|resultados|items)/i,
      /([\\d.,]+)\\s+productos\\b/i
    ];
    let explicitTotal=null;
    for(const re of explicit){const m=text.match(re);if(m){const n=Number(String(m[1]).replace(/\\.(?=\\d{3}(?:\\D|$))/g,'').replace(/,(?=\\d{3}(?:\\D|$))/g,''));if(Number.isFinite(n)&&n>=0){explicitTotal=n;break}}}
    const scopes=[...document.querySelectorAll('.pagination,.dataTables_paginate,[class*=paginate],[aria-label*=pagination i],[aria-label*=paginación i]')];
    const pool=scopes.length?scopes.flatMap(s=>[...s.querySelectorAll('a,button')]):[...document.querySelectorAll('a,button')];
    const next=pool.find(el=>{
      const label=clean([el.innerText,el.textContent,el.getAttribute('aria-label'),el.getAttribute('title'),el.getAttribute('rel')].filter(Boolean).join(' ')).toLowerCase();
      const disabled=el.disabled||el.getAttribute('aria-disabled')==='true'||/disabled/.test(String(el.className||''));
      if(disabled)return false;
      return /^(siguiente|next|›|»|>)$/.test(label)||/\\b(siguiente|next)\\b/.test(label);
    });
    return {url:location.href,text,headers:meaningful.headers,rows:meaningful.rows,explicitTotal,hasNext:Boolean(next)};
  })()`,true);
}

async function clickNext(win){
  return win.webContents.executeJavaScript(`(()=>{
    const clean=s=>String(s||'').replace(/\\s+/g,' ').trim();
    const scopes=[...document.querySelectorAll('.pagination,.dataTables_paginate,[class*=paginate],[aria-label*=pagination i],[aria-label*=paginación i]')];
    const pool=scopes.length?scopes.flatMap(s=>[...s.querySelectorAll('a,button')]):[...document.querySelectorAll('a,button')];
    const next=pool.find(el=>{
      const label=clean([el.innerText,el.textContent,el.getAttribute('aria-label'),el.getAttribute('title'),el.getAttribute('rel')].filter(Boolean).join(' ')).toLowerCase();
      const disabled=el.disabled||el.getAttribute('aria-disabled')==='true'||/disabled/.test(String(el.className||''));
      if(disabled)return false;
      return /^(siguiente|next|›|»|>)$/.test(label)||/\\b(siguiente|next)\\b/.test(label);
    });
    if(!next)return false;next.click();return true;
  })()`,true);
}

async function verifiedProductCount(question='',scope=null){
  const state=await readState();
  const portal=scope?.portalId?state.portals.find(p=>p.id===scope.portalId):selectPortal(state.portals,question);
  if(!portal)return {status:'no_portal'};
  const cap=portal.profile?.capabilities?.products;
  if(!cap?.url)return {status:'not_mapped',name:portal.name};
  if(!sameOrigin(cap.url,portal.url))return {status:'invalid_mapping',name:portal.name};

  const win=new BrowserWindow(windowOptions(portal));
  win.removeMenu();
  try{
    await win.loadURL(cap.url);await delay(500);
    const seenPages=new Set();const seenRows=new Set();let pages=0;let visibleFirst=0;let lastHasNext=false;
    while(pages<200){
      const p=await inspectProducts(win);pages++;
      if(p.explicitTotal!==null)return {status:'verified',name:portal.name,count:p.explicitTotal,pagesScanned:pages,method:'portal-total'};
      const sig=JSON.stringify((p.rows||[]).slice(0,3));
      if(seenPages.has(sig)&&sig!=='[]')break;
      seenPages.add(sig);
      if(pages===1)visibleFirst=(p.rows||[]).length;
      for(const row of p.rows||[])seenRows.add(JSON.stringify(row));
      lastHasNext=p.hasNext;
      if(!p.hasNext)break;
      const clicked=await clickNext(win);if(!clicked)break;
      await delay(550);
    }
    if(!lastHasNext&&pages>1)return {status:'verified',name:portal.name,count:seenRows.size,pagesScanned:pages,method:'pagination-count'};
    if(!lastHasNext&&pages===1&&visibleFirst>0&&visibleFirst<25)return {status:'verified',name:portal.name,count:seenRows.size,pagesScanned:1,method:'single-page-complete'};
    return {status:'uncertain',name:portal.name,visible:visibleFirst,rowsSeen:seenRows.size,pagesScanned:pages};
  }finally{if(!win.isDestroyed())win.destroy()}
}

ipcMain.handle('portal:verified-product-count',async(_e,payload)=>{const p=typeof payload==='string'?{question:payload,scope:null}:(payload||{});return verifiedProductCount(String(p.question||''),p.scope||null)});
