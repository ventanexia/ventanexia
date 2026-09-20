(()=>{
  function esc(v=''){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}

  const SECTION_TITLES=[
    'Resumen rápido','1. Lo más importante de hoy','2. Situación por área','3. Lo que ya he dejado preparado',
    '4. Necesito tu decisión','5. Alertas','6. Siguiente paso recomendado','7. Fuentes consultadas',
    'Buenos días · resumen breve','Mi recomendación para empezar','🟢 Puedo adelantar por ti',
    '🟡 Te lo dejo preparado para autorizar','🔴 Necesito tu decisión','📅 Agenda de hoy','Siguiente mejor acción'
  ];
  const AREAS=['Pedidos','Shopify','Web y tienda','Email','Gmail','Agenda','WhatsApp','Ventas y clientes','Redes y publicidad','Atención al cliente','Compras','Fuentes consultadas'];

  function extractReadableText(node){
    const clone=node.cloneNode(true);
    clone.querySelectorAll('.vnx-export-actions,.vnx-secretary-actions,.vnx-handoff-card,.email-action-btn,button,.btn,.mini').forEach(x=>x.remove());
    clone.querySelectorAll('br').forEach(br=>br.replaceWith('\n'));
    clone.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,div,section,article,tr').forEach(el=>{
      if(el.tagName==='LI'){
        el.insertBefore(document.createTextNode('\n- '),el.firstChild);
        el.appendChild(document.createTextNode('\n'));
      }else{
        el.insertBefore(document.createTextNode('\n'),el.firstChild);
        el.appendChild(document.createTextNode('\n'));
      }
    });
    return String(clone.textContent||'').replace(/\u00a0/g,' ').replace(/[ \t]+\n/g,'\n').replace(/\n[ \t]+/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
  }

  function injectBreaks(raw){
    let s=String(raw||'').replace(/\r/g,'').replace(/\u00a0/g,' ');
    s=s.replace(/Preparar y revisar respuestas|Revisar y enviar|Resolver decisiones|Ver Excel|Ver PDF/gi,'');
    for(const title of SECTION_TITLES){
      const x=title.replace(/[.*+?^$()|[\]\\]/g,'\\$&');
      s=s.replace(new RegExp('\\s*#{0,3}\\s*'+x+'\\s*:?[\\s]*','gi'),'\n## '+title+'\n');
    }
    for(const area of AREAS){
      const x=area.replace(/[.*+?^$()|[\]\\]/g,'\\$&');
      s=s.replace(new RegExp('\\s*(?='+x+'\\s*(?:[:·]|$))','gi'),'\n');
    }

    // Etiquetas que suelen llegar pegadas desde respuestas de IA/render markdown.
    const labels=[
      'Total pedidos','Total','Listos','Falta datos','Faltan datos','Para revisar','Bloqueos detectados','Pedidos bloqueados',
      'Total productos','Productos consultados','Últimos productos consultados','Stock total','Stock','Conexión activa',
      'Estado','Pendientes','En revisión','Para autorizar','Solucionado','No conectada','Cuota excedida',
      'Prioridad','Acción','Siguiente paso','Recomendación','Motivo','Cliente','Pedido','Referencia','Cantidad','Proveedor'
    ];
    const labelRx=labels.map(x=>x.replace(/[.*+?^$()|[\]\\]/g,'\\$&')).join('|');
    s=s.replace(new RegExp('\\s*(?=(?:'+labelRx+')\\s*:)','gi'),'\n');

    // IDs de pedido: cada pedido empieza línea nueva aunque venga pegado al anterior.
    s=s.replace(/\s*(?=(?:VNX-PED-|PED-|ORD-)[A-Z0-9_-]{3,})/gi,'\n');

    // Emojis de estado/alerta también crean línea.
    s=s.replace(/\s+(?=(?:🟢|🟡|🔴|📅|📌|✅|⚠️|➡️|❌))/g,'\n');

    // Listas numeradas pegadas.
    s=s.replace(/\s+(?=\d+[.)]\s+[A-ZÁÉÍÓÚÑ¿])/g,'\n');

    // Después de punto/interrogación en párrafos excesivamente largos.
    s=s.replace(/([.!?])\s+(?=[A-ZÁÉÍÓÚÑ¿])/g,'$1\n');

    return s.replace(/[ \t]{2,}/g,' ').replace(/\n{3,}/g,'\n\n').trim();
  }

  function splitDenseLine(line){
    const clean=String(line||'').trim();
    if(!clean)return[];
    // ; y separadores " · " suelen ser elementos independientes en los informes.
    let parts=clean.split(/\s*(?:;|\s·\s)\s*/).map(x=>x.trim()).filter(Boolean);
    if(parts.length===1&&clean.length>150){
      parts=clean.split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ¿])/).map(x=>x.trim()).filter(Boolean);
    }
    // Si sigue siendo enorme, separar por etiquetas internas.
    if(parts.length===1&&clean.length>180){
      parts=clean.split(/(?=(?:Total|Listos|Falta(?:n)? datos|Para revisar|Stock|Estado|Pedido|Referencia|Cantidad|Cliente)\s*:)/i).map(x=>x.trim()).filter(Boolean);
    }
    return parts.length?parts:[clean];
  }

  function parseReport(text){
    const lines=injectBreaks(text).split(/\n+/).map(x=>x.trim()).filter(Boolean);
    const blocks=[];
    let section='Resumen',area='';
    for(const source of lines){
      const line=source.replace(/^#{1,3}\s*/,'').trim();
      if(!line)continue;

      const sectionHit=SECTION_TITLES.find(t=>line.toLowerCase()===t.toLowerCase());
      if(sectionHit){section=sectionHit;area='';blocks.push({type:'heading',text:sectionHit,section,area:''});continue}

      const areaHit=AREAS.find(a=>line.toLowerCase()===a.toLowerCase()||line.toLowerCase().startsWith(a.toLowerCase()+':')||line.toLowerCase().startsWith(a.toLowerCase()+' ·'));
      if(areaHit){
        area=areaHit;
        blocks.push({type:'subheading',text:areaHit,section,area});
        const rest=line.slice(areaHit.length).replace(/^\s*[:·-]\s*/,'').trim();
        if(rest)splitDenseLine(rest).forEach(x=>blocks.push({type:'bullet',text:x,section,area}));
        continue;
      }

      const bullet=line.match(/^[-•▪◦]\s*(.+)/);
      const numbered=line.match(/^(\d+[.)])\s*(.+)/);
      if(numbered){
        splitDenseLine(numbered[2]).forEach((x,i)=>blocks.push({type:'number',marker:i===0?numbered[1]:'•',text:x,section,area}));
        continue;
      }
      if(bullet){
        splitDenseLine(bullet[1]).forEach(x=>blocks.push({type:'bullet',text:x,section,area}));
        continue;
      }

      // "Etiqueta: valor" pasa a una línea propia y Excel lo reconoce como dato.
      const kv=line.match(/^([^:]{2,42}):\s*(.+)$/);
      if(kv){
        const label=kv[1].trim(),value=kv[2].trim();
        splitDenseLine(value).forEach((x,i)=>blocks.push({type:'fact',label:i===0?label:'',text:x,section,area}));
        continue;
      }

      splitDenseLine(line).forEach(x=>blocks.push({
        type:/^(¿|Necesito|Autoriza|Confirma|Decide)/i.test(x)?'question':'bullet',
        text:x,section,area
      }));
    }
    return blocks;
  }

  function payloadFromText(text){
    const blocks=parseReport(text);
    const rows=[];
    let currentSection='General',currentArea='';
    for(const b of blocks){
      if(b.type==='heading'){currentSection=b.text;currentArea='';continue}
      if(b.type==='subheading'){currentArea=b.text;continue}
      rows.push([
        b.section||currentSection||'General',
        b.area||currentArea||'',
        b.type==='question'?'Decisión':b.type==='fact'?(b.label||'Dato'):b.type==='number'?'Prioridad':'Detalle',
        b.type==='number'?(b.marker+' '+b.text):b.text
      ]);
    }
    return {title:'Informe VentaNexIA',text,blocks,headers:['Sección','Área','Tipo','Detalle'],rows};
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
      if(b.type==='heading')return `<section class="vnx-report-section"><h2>${esc(b.text)}</h2></section>`;
      if(b.type==='subheading')return `<h3>${esc(b.text)}</h3>`;
      if(b.type==='fact')return `<div class="vnx-pdf-fact">${b.label?`<b>${esc(b.label)}</b>`:''}<span>${esc(b.text)}</span></div>`;
      if(b.type==='question')return `<div class="vnx-pdf-question"><span>?</span><p>${esc(b.text)}</p></div>`;
      if(b.type==='number')return `<div class="vnx-pdf-item numbered"><span>${esc(b.marker)}</span><p>${esc(b.text)}</p></div>`;
      return `<div class="vnx-pdf-item"><span>•</span><p>${esc(b.text)}</p></div>`;
    }).join('');
    return `<div class="vnx-preview-paper"><div class="vnx-doc-brand">VentaNexIA</div><h1>${esc(payload.title)}</h1><div class="vnx-doc-subtitle">Resumen de trabajo · información ordenada para decidir rápido</div><div class="vnx-doc-rule"></div><div class="vnx-doc-body">${html||`<p>${esc(payload.text||'')}</p>`}</div><footer>Generado por VentaNexIA</footer></div>`;
  }

  function previewExcel(payload){
    const rows=(payload.rows||[]).map(r=>`<tr><td>${esc(r[0]||'')}</td><td>${esc(r[1]||'')}</td><td>${esc(r[2]||'')}</td><td>${esc(r[3]||'')}</td></tr>`).join('');
    return `<div class="vnx-preview-sheet"><div class="vnx-preview-sheet-name">Hoja: Informe · una fila por dato, tarea o decisión</div><div class="vnx-preview-grid-wrap"><table><thead><tr><th>Sección</th><th>Área</th><th>Tipo</th><th>Detalle</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
  }

  function openPreview(format,msg){
    const text=extractReadableText(msg);if(!text)return;
    closePreview();
    const payload=payloadFromText(text);
    const overlay=document.createElement('div');
    overlay.id='vnxExportPreviewOverlay';
    overlay.style.cssText='position:fixed;inset:0;z-index:100000;background:rgba(1,9,17,.88);display:flex;align-items:center;justify-content:center;padding:18px';
    overlay.innerHTML=`
      <div class="vnx-preview-dialog">
        <div class="vnx-preview-head">
          <div class="vnx-preview-icon">${format==='pdf'?'📄':'📊'}</div>
          <div><b>Vista previa · ${format==='pdf'?'PDF':'Excel'}</b><small>${format==='pdf'?'Informe organizado por apartados.':'Cada dato, tarea o decisión ocupa su propia fila.'}</small></div>
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
      #vnxExportPreviewOverlay .vnx-preview-dialog{width:min(1180px,97vw);height:min(880px,95vh);display:flex;flex-direction:column;background:#061b2e;border:1px solid #2b8bc0;border-radius:16px;overflow:hidden;box-shadow:0 24px 80px #0009}
      #vnxExportPreviewOverlay .vnx-preview-head{display:flex;align-items:center;gap:12px;padding:14px 16px;border-bottom:1px solid #164560;background:#08243c}
      #vnxExportPreviewOverlay .vnx-preview-head b{display:block;color:#fff;font-size:15px}
      #vnxExportPreviewOverlay .vnx-preview-head small{display:block;color:#8fb7ce;margin-top:3px;font-size:11px}
      #vnxExportPreviewOverlay .vnx-preview-head>button{margin-left:auto;border:1px solid #2e6d91;background:#0b3150;color:#fff;border-radius:9px;padding:8px 11px;cursor:pointer}
      #vnxExportPreviewOverlay .vnx-preview-icon{font-size:22px}
      #vnxExportPreviewOverlay .vnx-preview-stage{flex:1;min-height:0;overflow:auto;padding:24px}
      #vnxExportPreviewOverlay .vnx-preview-stage.pdf{background:#46545f}
      #vnxExportPreviewOverlay .vnx-preview-stage.excel{background:#0a2237}
      #vnxExportPreviewOverlay .vnx-preview-foot{display:flex;justify-content:flex-end;gap:9px;padding:12px 16px;border-top:1px solid #164560;background:#08243c}
      #vnxExportPreviewOverlay .vnx-preview-paper{width:min(820px,100%);min-height:100%;box-sizing:border-box;margin:0 auto;background:#fff;color:#1b2b3d;padding:44px 52px;box-shadow:0 8px 30px #0005;font-family:Arial,sans-serif}
      #vnxExportPreviewOverlay .vnx-doc-brand{font-size:11px;font-weight:800;letter-spacing:.11em;color:#45708d;text-transform:uppercase}
      #vnxExportPreviewOverlay .vnx-preview-paper h1{font-size:25px;line-height:1.2;margin:7px 0 3px;color:#102235}
      #vnxExportPreviewOverlay .vnx-doc-subtitle{font-size:11px;color:#738596;margin-bottom:13px}
      #vnxExportPreviewOverlay .vnx-doc-rule{height:2px;background:#dbe6ed;margin-bottom:20px}
      #vnxExportPreviewOverlay .vnx-doc-body{max-width:700px}
      #vnxExportPreviewOverlay .vnx-preview-paper h2{font-size:16px;line-height:1.3;margin:25px 0 10px;padding:8px 10px;background:#edf5f9;border-left:4px solid #2274a0;color:#123b58}
      #vnxExportPreviewOverlay .vnx-preview-paper h3{font-size:13.5px;line-height:1.3;margin:17px 0 8px;color:#174e70;border-bottom:1px solid #dce7ed;padding-bottom:5px}
      #vnxExportPreviewOverlay .vnx-pdf-item,#vnxExportPreviewOverlay .vnx-pdf-question{display:grid;grid-template-columns:28px 1fr;gap:5px;margin:0 0 8px;align-items:start}
      #vnxExportPreviewOverlay .vnx-pdf-item>span{font-size:12px;font-weight:800;color:#2274a0;padding-top:2px}
      #vnxExportPreviewOverlay .vnx-pdf-item p,#vnxExportPreviewOverlay .vnx-pdf-question p{font-size:12.8px;line-height:1.5;margin:0;color:#26394c}
      #vnxExportPreviewOverlay .vnx-pdf-question{background:#fff8e8;border:1px solid #f1d79c;border-radius:8px;padding:8px 10px;margin:7px 0}
      #vnxExportPreviewOverlay .vnx-pdf-question>span{font-weight:900;color:#a46a00}
      #vnxExportPreviewOverlay .vnx-pdf-fact{display:grid;grid-template-columns:minmax(105px,170px) 1fr;gap:10px;padding:6px 0;border-bottom:1px solid #edf1f4;font-size:12.5px;line-height:1.45}
      #vnxExportPreviewOverlay .vnx-pdf-fact b{color:#294b62}
      #vnxExportPreviewOverlay .vnx-preview-paper footer{margin-top:34px;padding-top:12px;border-top:1px solid #e4ebf0;color:#71808c;font-size:10px}
      #vnxExportPreviewOverlay .vnx-preview-sheet{min-width:920px;background:#fff;color:#142331;border:1px solid #7d98a9}
      #vnxExportPreviewOverlay .vnx-preview-sheet-name{padding:9px 11px;background:#e8f0f5;border-bottom:1px solid #bac9d3;font:700 11px Arial,sans-serif}
      #vnxExportPreviewOverlay .vnx-preview-grid-wrap{overflow:auto}
      #vnxExportPreviewOverlay .vnx-preview-sheet table{width:100%;border-collapse:collapse;font:12px Arial,sans-serif;table-layout:fixed}
      #vnxExportPreviewOverlay .vnx-preview-sheet th,#vnxExportPreviewOverlay .vnx-preview-sheet td{border:1px solid #ccd8df;padding:9px 10px;text-align:left;vertical-align:top;white-space:normal;overflow-wrap:anywhere;line-height:1.45}
      #vnxExportPreviewOverlay .vnx-preview-sheet th{background:#dce8ef;position:sticky;top:0;z-index:2}
      #vnxExportPreviewOverlay .vnx-preview-sheet th:nth-child(1){width:20%}
      #vnxExportPreviewOverlay .vnx-preview-sheet th:nth-child(2){width:14%}
      #vnxExportPreviewOverlay .vnx-preview-sheet th:nth-child(3){width:12%}
      #vnxExportPreviewOverlay .vnx-preview-sheet th:nth-child(4){width:54%}
      #vnxExportPreviewOverlay .vnx-preview-sheet td:nth-child(1),#vnxExportPreviewOverlay .vnx-preview-sheet td:nth-child(2),#vnxExportPreviewOverlay .vnx-preview-sheet td:nth-child(3){font-weight:700}
      @media(max-width:800px){#vnxExportPreviewOverlay .vnx-preview-paper{padding:28px 24px}}
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
      const text=extractReadableText(msg),lines=text.split(/\r?\n/).filter(Boolean);
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
