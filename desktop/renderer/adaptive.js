(()=>{
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  function summary(profile){
    const caps=profile?.capabilities||{};
    const labels={products:'Productos',orders:'Pedidos',invoices:'Facturas',customers:'Clientes',prices:'Precios/Tarifas',stock:'Stock',alerts:'Alertas',dashboard:'Dashboard'};
    const rows=Object.entries(labels).map(([k,label])=>{
      const c=caps[k];return `<span style="display:inline-block;margin:3px 8px 3px 0;padding:4px 8px;border-radius:999px;background:${c?'#e8f7ef':'#f3f5f7'}">${c?'✓':'—'} ${label}</span>`;
    }).join('');
    return `<div style="margin-top:8px">${rows}</div>`;
  }
  async function calibrate(id,btn){
    const msg=document.querySelector('#portalMsg');
    btn.disabled=true;const old=btn.textContent;btn.textContent='Analizando…';
    if(msg)msg.textContent='VentaNexIA está analizando menús, tablas, buscadores y áreas de datos del portal en modo solo lectura.';
    try{
      const r=await window.vnx.calibratePortal(id);
      if(r.status==='login_required'){if(msg)msg.textContent='La sesión ha caducado. Vuelve a conectar el portal y repite el análisis.';return;}
      if(msg)msg.innerHTML=`Portal preparado. Se han detectado ${Object.keys(r.profile?.capabilities||{}).length} áreas empresariales.${summary(r.profile)}`;
    }catch(e){if(msg)msg.textContent=e.message||'No se pudo analizar el portal'}
    finally{btn.disabled=false;btn.textContent=old}
  }
  function enhance(){
    document.querySelectorAll('.master-portal-check').forEach(check=>{
      const id=check.dataset.id;if(!id||check.parentElement?.querySelector(`.master-portal-calibrate[data-id="${CSS.escape(id)}"]`))return;
      const b=document.createElement('button');b.className='mini master-portal-calibrate';b.dataset.id=id;b.textContent='Preparar IA';b.onclick=()=>calibrate(id,b);
      check.parentElement.insertBefore(b,check);
    });
  }
  const mo=new MutationObserver(enhance);mo.observe(document.documentElement,{subtree:true,childList:true});setInterval(enhance,2000);setTimeout(enhance,700);
})();
