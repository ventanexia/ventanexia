const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const API='/api';
let session=null;
function deviceKey(){let k=localStorage.getItem('vnx_mobile_device');if(!k){k=crypto.randomUUID();localStorage.setItem('vnx_mobile_device',k)}return k}
async function fingerprint(){
  const raw=[navigator.userAgent,navigator.language,screen.width,screen.height].join('|');
  const bytes=new TextEncoder().encode(raw);
  const hash=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
async function post(endpoint,body){
  const r=await fetch(API+'/'+endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body||{})});
  const j=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(j.error||j.message||'No se pudo conectar');
  return j;
}
function saveSession(v,remember=false){session=v;sessionStorage.setItem('vnx_mobile_session',JSON.stringify(v));if(remember)localStorage.setItem('vnx_mobile_saved_session',JSON.stringify(v));else localStorage.removeItem('vnx_mobile_saved_session')}
function loadSession(){try{return JSON.parse(sessionStorage.getItem('vnx_mobile_session')||localStorage.getItem('vnx_mobile_saved_session')||'null')}catch{return null}}
function showApp(){session=loadSession()||session;if(!session)return;$('#login').classList.add('hidden');$('#app').classList.remove('hidden');}
function showLogin(){session=null;sessionStorage.removeItem('vnx_mobile_session');localStorage.removeItem('vnx_mobile_saved_session');$('#app').classList.add('hidden');$('#login').classList.remove('hidden')}
function openView(id){
  $$('.view').forEach(v=>v.classList.toggle('active',v.id===id));
  $$('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===id));
  $('#drawer').classList.remove('open');
  window.scrollTo({top:0,behavior:'smooth'});
}
$('#loginBtn').onclick=async()=>{
  const customerId=$('#customerId').value.trim().toUpperCase(),password=$('#password').value.trim(),msg=$('#loginMsg'),btn=$('#loginBtn');
  if(!customerId||!password){msg.textContent='Escribe tu ID y tu contraseña.';return}
  btn.disabled=true;btn.textContent='Entrando…';msg.textContent='';
  try{
    const result=await post('device-register',{customerId,activationCode:password,deviceKey:deviceKey(),fingerprintHash:await fingerprint(),deviceName:'Móvil',platform:navigator.userAgent.slice(0,80),appVersion:'mobile-0.1'});
    const remember=Boolean($('#rememberMe')?.checked);
    saveSession({customerId,deviceId:result.deviceId||null,plan:result.planKey||null,limit:result.limit||0},remember);
    $('#password').value='';showApp();
  }catch(e){msg.textContent=e.message||'No he podido entrar.'}
  finally{btn.disabled=false;btn.textContent='Entrar'}
};
$('#logoutBtn').onclick=showLogin;
$('#menuBtn').onclick=()=>$('#drawer').classList.toggle('open');
$$('[data-view]').forEach(b=>b.onclick=()=>openView(b.dataset.view));
$$('[data-go]').forEach(b=>b.onclick=()=>openView(b.dataset.go));

let chat=[];
function renderChat(){
  $('#chatMessages').innerHTML='<div class="bubble ai">¿Qué quieres hacer?</div>'+chat.map(m=>'<div class="bubble '+(m.role==='user'?'user':'ai')+'">'+String(m.content||'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])).replace(/\n/g,'<br>')+'</div>').join('');
  $('#chatMessages').scrollTop=$('#chatMessages').scrollHeight;
}
$('#chatForm').onsubmit=async e=>{
  e.preventDefault();const input=$('#chatInput'),text=input.value.trim();if(!text)return;
  chat.push({role:'user',content:text});input.value='';renderChat();const btn=e.submitter;btn.disabled=true;btn.textContent='Mirándolo…';
  try{
    const r=await post('chat',{messages:chat,desktop:false,mobile:true,customerId:session?.customerId});
    chat.push({role:'assistant',content:r.reply||'No tengo respuesta todavía.'});renderChat();
  }catch(err){chat.push({role:'assistant',content:'No he podido conectar: '+err.message});renderChat()}
  finally{btn.disabled=false;btn.textContent='Enviar'}
};

$$('[data-master]').forEach(btn=>btn.onclick=async()=>{
  const key=btn.dataset.master,root=$('#masterResult');
  const prompts={
    clientes:'Muéstrame los clientes disponibles para esta cuenta.',
    facturas:'Muéstrame las facturas disponibles para esta cuenta.',
    pedidos:'Muéstrame los pedidos disponibles para esta cuenta.',
    datos:'Resume todos los datos empresariales disponibles para esta cuenta.'
  };
  root.innerHTML='<div class="empty">Mirándolo…</div>';
  try{
    const r=await post('chat',{messages:[{role:'user',content:prompts[key]}],desktop:false,mobile:true,customerId:session?.customerId});
    root.innerHTML='<div class="bubble ai">'+String(r.reply||'Todavía no hay datos compartidos con el móvil.').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])).replace(/\n/g,'<br>')+'</div>';
  }catch(e){root.innerHTML='<div class="empty">No he podido mostrar los datos: '+e.message+'</div>'}
});

if('serviceWorker' in navigator)navigator.serviceWorker.register('/app/sw.js').catch(()=>{});
session=loadSession();if(session){$('#customerId').value=session.customerId||'';showApp()}
