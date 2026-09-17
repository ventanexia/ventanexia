(()=>{
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
  async function run(btn,format,msg){
    const text=cleanText(msg);if(!text)return;
    btn.disabled=true;const old=btn.textContent;btn.textContent=format==='pdf'?'Creando PDF…':'Creando Excel…';
    try{
      const r=await window.vnx.exportData({...payloadFromText(text),format});
      if(r?.ok)btn.textContent='Guardado ✓';else btn.textContent=old;
    }catch(e){btn.textContent='Error';setTimeout(()=>btn.textContent=old,1800);return;}
    setTimeout(()=>btn.textContent=old,1800);btn.disabled=false;
  }
  function enhance(){
    document.querySelectorAll('#messages .msg.ai').forEach(msg=>{
      if(msg.dataset.exportReady==='1')return;
      const text=cleanText(msg),lines=text.split(/\r?\n/).filter(Boolean);
      if(text.length<220&&lines.length<5)return;
      msg.dataset.exportReady='1';
      const box=document.createElement('div');box.className='vnx-export-actions';box.style.cssText='display:flex;gap:8px;margin-top:10px;flex-wrap:wrap';
      const excel=document.createElement('button');excel.className='mini';excel.textContent='Descargar Excel';excel.type='button';excel.onclick=()=>run(excel,'excel',msg);
      const pdf=document.createElement('button');pdf.className='mini';pdf.textContent='Descargar PDF';pdf.type='button';pdf.onclick=()=>run(pdf,'pdf',msg);
      box.append(excel,pdf);msg.appendChild(box);
    });
  }
  const mo=new MutationObserver(enhance);mo.observe(document.documentElement,{subtree:true,childList:true});
  setInterval(enhance,1500);setTimeout(enhance,700);
})();
