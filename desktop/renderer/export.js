(()=>{
  function esc(v=''){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function cleanText(node){
    const clone=node.cloneNode(true);
    clone.querySelectorAll('.vnx-export-actions').forEach(x=>x.remove());
    return String(clone.innerText||'').trim();
  }
  function payloadFromText(text){
    const lines=String(text||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
    const split=lines.map(line=>line.includes(' · ')?line.split(' · ').map(x=>x.trim()):[line]);
    const width=Math.max(1,...split.map(r=>r.length));
    const rows=split.map(r=>[...r,...Array(Math.max(0,width-r.length)).fill('')]);
    return {title:'Datos VentaNexIA',text,headers:width>1?Array.from({length:width},(_,i)=>`Campo ${i+1}`):['Resultado'],rows};
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
  function closePreview(){
    document.getElementById('vnxExportPreviewOverlay')?.remove();
  }
  function previewTable(payload,format){
    const heads=(payload.headers||[]).map(h=>`<th>${esc(h)}</th>`).join('');
    const rows=(payload.rows||[]).map(r=>`<tr>${(payload.headers||[]).map((_,i)=>`<td>${esc(r[i]??'')}</td>`).join('')}</tr>`).join('');
    if(format==='excel'){
      return `<div class="vnx-preview-sheet"><div class="vnx-preview-sheet-name">Hoja: Datos</div><div class="vnx-preview-grid-wrap"><table><thead><tr>${heads}</tr></thead><tbody>${rows}</tbody></table></div></div>`;
    }
    return `<div class="vnx-preview-paper"><h1>${esc(payload.title)}</h1>${rows?`<table><thead><tr>${heads}</tr></thead><tbody>${rows}</tbody></table>`:`<pre>${esc(payload.text||'')}</pre>`}<footer>Generado por VentaNexIA</footer></div>`;
  }
  function openPreview(format,msg){
    const text=cleanText(msg);if(!text)return;
    closePreview();
    const payload=payloadFromText(text);
    const overlay=document.createElement('div');
    overlay.id='vnxExportPreviewOverlay';
    overlay.style.cssText='position:fixed;inset:0;z-index:100000;background:rgba(1,9,17,.88);display:flex;align-items:center;justify-content:center;padding:18px';
    overlay.innerHTML=`
      <div style="width:min(1120px,97vw);height:min(820px,94vh);display:flex;flex-direction:column;background:#061b2e;border:1px solid #2b8bc0;border-radius:16px;overflow:hidden;box-shadow:0 24px 80px #0009">
        <div style="display:flex;align-items:center;gap:12px;padding:14px 16px;border-bottom:1px solid #164560;background:#08243c">
          <div style="font-size:22px">${format==='pdf'?'📄':'📊'}</div>
          <div><b style="display:block;color:#fff">Vista previa · ${format==='pdf'?'PDF':'Excel'}</b><small style="color:#8fb7ce">Revísalo antes de guardarlo. No se descargará nada hasta que pulses Guardar.</small></div>
          <button type="button" data-preview-close style="margin-left:auto;border:1px solid #2e6d91;background:#0b3150;color:#fff;border-radius:9px;padding:8px 11px;cursor:pointer">✕ Cerrar</button>
        </div>
        <div style="flex:1;min-height:0;overflow:auto;padding:18px;background:${format==='pdf'?'#44515b':'#0a2237'}">${previewTable(payload,format)}</div>
        <div style="display:flex;justify-content:flex-end;gap:9px;padding:12px 16px;border-top:1px solid #164560;background:#08243c">
          <button type="button" data-preview-cancel class="mini">Cerrar sin guardar</button>
          <button type="button" data-preview-save class="btn primary">Guardar ${format==='pdf'?'PDF':'Excel'}</button>
        </div>
      </div>`;
    const style=document.createElement('style');
    style.textContent=`
      #vnxExportPreviewOverlay .vnx-preview-paper{width:min(820px,100%);min-height:100%;box-sizing:border-box;margin:0 auto;background:#fff;color:#172536;padding:34px 38px;box-shadow:0 8px 30px #0005}
      #vnxExportPreviewOverlay .vnx-preview-paper h1{font:700 22px Arial,sans-serif;margin:0 0 20px}
      #vnxExportPreviewOverlay .vnx-preview-paper table,#vnxExportPreviewOverlay .vnx-preview-sheet table{width:100%;border-collapse:collapse;font:12px Arial,sans-serif}
      #vnxExportPreviewOverlay .vnx-preview-paper th,#vnxExportPreviewOverlay .vnx-preview-paper td{border:1px solid #d6dfe7;padding:7px 8px;text-align:left;vertical-align:top}
      #vnxExportPreviewOverlay .vnx-preview-paper th{background:#edf3f7}
      #vnxExportPreviewOverlay .vnx-preview-paper pre{white-space:pre-wrap;font:12px Arial,sans-serif}
      #vnxExportPreviewOverlay .vnx-preview-paper footer{margin-top:24px;color:#71808c;font:10px Arial,sans-serif}
      #vnxExportPreviewOverlay .vnx-preview-sheet{min-width:720px;background:#fff;color:#142331;border:1px solid #7d98a9}
      #vnxExportPreviewOverlay .vnx-preview-sheet-name{padding:7px 10px;background:#e8f0f5;border-bottom:1px solid #bac9d3;font:700 11px Arial,sans-serif}
      #vnxExportPreviewOverlay .vnx-preview-grid-wrap{overflow:auto}
      #vnxExportPreviewOverlay .vnx-preview-sheet th,#vnxExportPreviewOverlay .vnx-preview-sheet td{border:1px solid #ccd8df;padding:6px 8px;text-align:left;vertical-align:top;white-space:pre-wrap}
      #vnxExportPreviewOverlay .vnx-preview-sheet th{background:#dce8ef;position:sticky;top:0}
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
