(()=>{
  function esc(v=''){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function cleanText(node){
    const clone=node.cloneNode(true);
    clone.querySelectorAll('.vnx-export-actions,.vnx-secretary-actions,.vnx-handoff-card,.email-action-btn').forEach(x=>x.remove());
    return String(clone.innerText||'').trim();
  }
  const SECTION_TITLES=[
    'Resumen rápido','1. Lo más importante de hoy','2. Situación por área','3. Lo que ya he dejado preparado',
    '4. Necesito tu decisión','5. Alertas','6. Siguiente paso recomendado','7. Fuentes consultadas',
    'Buenos días · resumen breve','Mi recomendación para empezar','🟢 Puedo adelantar por ti',
    '🟡 Te lo dejo preparado para autorizar','🔴 Necesito tu decisión','📅 Agenda de hoy','Siguiente mejor acción'
  ];
  function normalizeReportText(text){
    let raw=String(text||'').replace(/\r/g,'').replace(/\u00a0/g,' ').trim();
    raw=raw.replace(/Preparar y revisar respuestas/gi,'').replace(/Revisar y enviar/gi,'').replace(/Resolver decisiones/gi,'').replace(/Ver Excel/gi,'').replace(/Ver PDF/gi,'');
    for(const title of SECTION_TITLES){
      const escaped=title.replace(/[.*+?^$()|[\]\\]/g,'\\$&');
      raw=raw.replace(new RegExp('\\s*#{0,3}\\s*'+escaped+'\\s*:?[\\s]*','gi'),'\n## '+title+'\n');
    }
    raw=raw.replace(/\s+(?=(?:Pedidos|Shopify|Web y tienda|Email|Agenda|WhatsApp|Ventas y clientes|Redes y publicidad|Fuentes consultadas)\s*[:·])/gi,'\n')
      .replace(/\s+(?=(?:🟢|🟡|🔴|📅|📌|✅|⚠️|➡️|❌))/g,'\n')
      .replace(/\s+(?=\d+[.)]\s+[A-ZÁÉÍÓÚÑ])/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
    return raw;
  }
  function smartLines(text){return normalizeReportText(text).split(/\n+/).map(x=>x.trim()).filter(Boolean)}
  function narrativeBlocks(text){
    const out=[];
    for(const line0 of smartLines(text)){
      const line=line0.replace(/^#{1,3}\s*/,'').trim(); if(!line)continue;
      if(SECTION_TITLES.some(t=>line.toLowerCase()===t.toLowerCase())){out.push({type:'heading',text:line});continue}
      const bullet=line.match(/^[-•▪◦]\s+(.+)/), numbered=line.match(/^(\d+[.)])\s+(.+)/);
      const area=line.match(/^(Pedidos|Shopify|Web y tienda|Email|Agenda|WhatsApp|Ventas y clientes|Redes y publicidad|Atención al cliente|Compras|Fuentes consultadas)\s*[:·]?\s*(.*)$/i);
      if(area){out.push({type:'subheading',text:area[1]});if(area[2])out.push({type:'bullet',text:area[2]});continue}
      if(bullet){out.push({type:'bullet',text:bullet[1]});continue}
      if(numbered){out.push({type:'number',marker:numbered[1],text:numbered[2]});continue}
      const parts=line.split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ¿])/).map(x=>x.trim()).filter(Boolean);
      if(parts.length>1&&line.length>170)parts.forEach(p=>out.push({type:'bullet',text:p}));
      else out.push({type:'paragraph',text:line});
    }
    return out;
  }
  function payloadFromText(text){
    const blocks=narrativeBlocks(text);
    const rows=[];
    let section='General';
    for(const b of blocks){
      if(b.type==='heading'){section=b.text;continue}
      rows.push([section,b.type==='number'?(b.marker+' '+b.text):b.text]);
    }
    return {title:'Informe VentaNexIA',text,blocks,headers:['Sección','Contenido'],rows};
  }
  async function save(btn,format,payload){
    btn.disabled=true;const old=btn.textContent;btn.textContent=format==='pdf'?'Guardando PDF…':'Guardando Excel…';
    try{
      const r=await window.vnx.exportData({...payload,format});
      if(r?.ok){btn.textContent='Guardado ✓';setTimeout(()=>closePreview(),900)}
      else btn.textContent=old;
    }catch(e){btn.textContent='Error al guardar';setTimeout(()=>btn.textContent=old,1800);return}
    setTimeout(()=>{btn.textContent=old;btn.disabled=false},1800);
  }
  function closePreview(){document.getElementById('vnxExportPreviewOverlay')?.remove()}
  function previewNarrative(payload){
    const html=(payload.blocks||[]).map(b=>{
      if(b.type==='heading')return `<h2>${esc(b.text)}</h2>`;
      if(b.type==='subheading')return `<h3>${esc(b.text)}</h3>`;
      if(b.type==='bullet')return `<div class="vnx-pdf-item"><span>•</span><p>${esc(b.text)}</p></div>`;
      if(b.type==='number')return `<div class="vnx-pdf-item"><span>${esc(b.marker)}</span><p>${esc(b.text)}</p></div>`;
      return `<p>${esc(b.text)}</p>`;
    }).join('');
    return `<div class="vnx-preview-paper"><div class="vnx-doc-brand">VentaNexIA</div><h1>${esc(payload.title)}</h1><div class="vnx-doc-rule"></div><div class="vnx-doc-body">${html||`<p>${esc(payload.text||'')}</p>`}</div><footer>Generado por VentaNexIA</footer></div>`;
  }
  function previewExcel(payload){
    const rows=(payload.rows||[]).map(r=>`<tr><td>${esc(r[0]||'')}</td><td>${esc(r[1]||'')}</td></tr>`).join('');
    return `<div class="vnx-preview-sheet"><div class="vnx-preview-sheet-name">Hoja: Informe</div><div class="vnx-preview-grid-wrap"><table><thead><tr><th>Sección</th><th>Contenido</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
  }
  function openPreview(format,msg){
    const text=cleanText(msg);if(!text)return;
    closePreview();
    const payload=payloadFromText(text);
    const overlay=document.createElement('div');
    overlay.id='vnxExportPreviewOverlay';
    overlay.style.cssText='position:fixed;inset:0;z-index:100000;background:rgba(1,9,17,.88);display:flex;align-items:center;justify-content:center;padding:18px';
    overlay.innerHTML=`
      <div class="vnx-preview-dialog">
        <div class="vnx-preview-head">
          <div class="vnx-preview-icon">${format==='pdf'?'📄':'📊'}</div>
          <div><b>Vista previa · ${format==='pdf'?'PDF':'Excel'}</b><small>Revísalo antes de guardarlo. No se descargará nada hasta que pulses Guardar.</small></div>
          <button type="button" data-preview-close>✕ Cerrar</button>
        </div>
        <div class="vnx-preview-stage ${format==='pdf'?'pdf':'excel'}">${format==='pdf'?previewNarrative(payload):previewExcel(payload)}</div>
        <div class="vnx-preview-foot">
          <button type="button" data-preview-cancel class="mini">Cerrar sin guardar</button>
          <button type="button" data-preview-save class="btn primary">Guardar ${format==='pdf'?'PDF':'Excel'}</button>
        </div>
      </div>`;
    const style=document.createElement('style');
    style.textContent=`
      #vnxExportPreviewOverlay .vnx-preview-dialog{width:min(1120px,97vw);height:min(860px,94vh);display:flex;flex-direction:column;background:#061b2e;border:1px solid #2b8bc0;border-radius:16px;overflow:hidden;box-shadow:0 24px 80px #0009}
      #vnxExportPreviewOverlay .vnx-preview-head{display:flex;align-items:center;gap:12px;padding:14px 16px;border-bottom:1px solid #164560;background:#08243c}
      #vnxExportPreviewOverlay .vnx-preview-head b{display:block;color:#fff;font-size:15px}
      #vnxExportPreviewOverlay .vnx-preview-head small{display:block;color:#8fb7ce;margin-top:3px;font-size:11px}
      #vnxExportPreviewOverlay .vnx-preview-head>button{margin-left:auto;border:1px solid #2e6d91;background:#0b3150;color:#fff;border-radius:9px;padding:8px 11px;cursor:pointer}
      #vnxExportPreviewOverlay .vnx-preview-icon{font-size:22px}
      #vnxExportPreviewOverlay .vnx-preview-stage{flex:1;min-height:0;overflow:auto;padding:24px}
      #vnxExportPreviewOverlay .vnx-preview-stage.pdf{background:#46545f}
      #vnxExportPreviewOverlay .vnx-preview-stage.excel{background:#0a2237}
      #vnxExportPreviewOverlay .vnx-preview-foot{display:flex;justify-content:flex-end;gap:9px;padding:12px 16px;border-top:1px solid #164560;background:#08243c}
      #vnxExportPreviewOverlay .vnx-preview-paper{width:min(820px,100%);min-height:100%;box-sizing:border-box;margin:0 auto;background:#fff;color:#1b2b3d;padding:48px 54px;box-shadow:0 8px 30px #0005;font-family:Arial,sans-serif}
      #vnxExportPreviewOverlay .vnx-doc-brand{font-size:12px;font-weight:800;letter-spacing:.08em;color:#45708d;text-transform:uppercase}
      #vnxExportPreviewOverlay .vnx-preview-paper h1{font-size:25px;line-height:1.2;margin:8px 0 12px;color:#102235}
      #vnxExportPreviewOverlay .vnx-doc-rule{height:2px;background:#dbe6ed;margin-bottom:26px}
      #vnxExportPreviewOverlay .vnx-doc-body{max-width:690px}
      #vnxExportPreviewOverlay .vnx-preview-paper h2{font-size:16px;line-height:1.3;margin:24px 0 9px;color:#123b58}
      #vnxExportPreviewOverlay .vnx-preview-paper h3{font-size:13px;line-height:1.3;margin:16px 0 7px;color:#345b73}
      #vnxExportPreviewOverlay .vnx-preview-paper p{font-size:13px;line-height:1.58;margin:0 0 12px;color:#26394c;white-space:pre-wrap}
      #vnxExportPreviewOverlay .vnx-pdf-item{display:grid;grid-template-columns:28px 1fr;gap:4px;margin:0 0 8px;align-items:start}
      #vnxExportPreviewOverlay .vnx-pdf-item>span{font-size:12px;font-weight:700;color:#2274a0;padding-top:2px}
      #vnxExportPreviewOverlay .vnx-pdf-item p{margin:0}
      #vnxExportPreviewOverlay .vnx-preview-paper footer{margin-top:34px;padding-top:12px;border-top:1px solid #e4ebf0;color:#71808c;font-size:10px}
      #vnxExportPreviewOverlay .vnx-preview-sheet{min-width:760px;background:#fff;color:#142331;border:1px solid #7d98a9}
      #vnxExportPreviewOverlay .vnx-preview-sheet-name{padding:8px 10px;background:#e8f0f5;border-bottom:1px solid #bac9d3;font:700 11px Arial,sans-serif}
      #vnxExportPreviewOverlay .vnx-preview-grid-wrap{overflow:auto}
      #vnxExportPreviewOverlay .vnx-preview-sheet table{width:100%;border-collapse:collapse;font:12px Arial,sans-serif;table-layout:fixed}
      #vnxExportPreviewOverlay .vnx-preview-sheet th,#vnxExportPreviewOverlay .vnx-preview-sheet td{border:1px solid #ccd8df;padding:8px 10px;text-align:left;vertical-align:top;white-space:pre-wrap;line-height:1.45}
      #vnxExportPreviewOverlay .vnx-preview-sheet th{background:#dce8ef;position:sticky;top:0}
      #vnxExportPreviewOverlay .vnx-preview-sheet th:first-child,#vnxExportPreviewOverlay .vnx-preview-sheet td:first-child{width:24%;font-weight:700}
      @media(max-width:800px){#vnxExportPreviewOverlay .vnx-preview-paper{padding:30px 26px}}
    `;
    overlay.appendChild(style);
    document.body.appendChild(overlay);
    overlay.querySelector('[data-preview-close]').onclick=closePreview;
    overlay.querySelector('[data-preview-cancel]').onclick=closePreview;
    overlay.addEventListener('click',e=>{if(e.target===overlay)closePreview()});
    overlay.querySelector('[data-preview-save]').onclick=e=>save(e.currentTarget,format,payload);
  }
  function enhance(){
    document.querySelectorAll('#messages .msg.ai').forEach(msg=>{
      if(msg.dataset.exportReady==='1')return;
      const text=cleanText(msg),lines=text.split(/\r?\n/).filter(Boolean);
      if(text.length<220&&lines.length<5)return;
      msg.dataset.exportReady='1';
      const box=document.createElement('div');box.className='vnx-export-actions';box.style.cssText='display:flex;gap:8px;margin-top:10px;flex-wrap:wrap';
      const excel=document.createElement('button');excel.className='mini';excel.textContent='Ver Excel';excel.type='button';excel.onclick=()=>openPreview('excel',msg);
      const pdf=document.createElement('button');pdf.className='mini';pdf.textContent='Ver PDF';pdf.type='button';pdf.onclick=()=>openPreview('pdf',msg);
      box.append(excel,pdf);msg.appendChild(box);
    });
  }
  const mo=new MutationObserver(enhance);mo.observe(document.documentElement,{subtree:true,childList:true});
  setInterval(enhance,1500);setTimeout(enhance,700);
})();
