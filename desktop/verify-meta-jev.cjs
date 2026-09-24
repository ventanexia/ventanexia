'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const errors=[],ok=(v,msg)=>{if(!v)errors.push(msg)};

const oauth=read('server/handlers/oauth-common.js');
const callback=read('server/handlers/oauth-callback.js');
const wa=read('server/lib/whatsapp-core.js');
const main=read('desktop/main.cjs');
const adaptive=read('desktop/portal-adaptive.cjs');
const ui=read('desktop/renderer/app.js');
const html=read('desktop/renderer/index.html');
const jev=read('lib/jev-client.js');
const routing=JSON.parse(read('config/ai-routing.json'));
const agents=JSON.parse(read('config/agents.json'));

ok(oauth.includes('META_GRAPH_VERSION="v26.0"'),'Meta OAuth no usa Graph API v26');
ok(!oauth.includes('v20.0')&&!wa.includes('v20.0')&&!main.includes('v20.0')&&!adaptive.includes('v20.0'),'Quedan endpoints Meta v20 obsoletos');
ok(oauth.includes('"meta_social"')&&oauth.includes('instagram_content_publish')&&oauth.includes('pages_manage_posts'),'Meta Social no solicita los permisos previstos');
ok(callback.includes('exchangeMetaLongLivedToken'),'Meta OAuth no intercambia token de larga duración');
ok(main.includes("provider==='meta_social'")&&main.includes('pageAccessToken'),'Desktop no descubre activos Meta completos');
ok(adaptive.includes("p==='meta_social'")&&adaptive.includes("source:'meta_graph_api'"),'El lector de datos no soporta Meta unificado');
ok(ui.includes("['meta_social','Meta · Facebook + Instagram']"),'La interfaz no ofrece Meta unificado');
ok(html.includes('Meta y redes sociales')&&html.includes('WhatsApp Business · Meta'),'Meta no está visible como conexión de primer nivel');

ok(routing.decision_model?.provider==='typesafe'&&routing.decision_model?.model==='jev-latest','La política de IA no prioriza Jev');
ok(routing.decision_model?.use_for?.includes('classification')&&routing.decision_model?.use_for?.includes('routing')&&routing.decision_model?.use_for?.includes('scoring'),'Faltan tareas de decisión asignadas a Jev');
ok(jev.includes('https://api.typesafe.ai/v1/systemone')&&jev.includes('jev-latest'),'Cliente Jev no apunta al endpoint/modelo esperado');
ok(jev.includes('TYPESAFE_API_KEY')&&!jev.includes('tsf_'),'La clave Jev debe venir del entorno, no del código');
ok(wa.includes('createJevDecision')&&wa.includes('requires_human_approval')&&wa.includes('Fail closed'),'WhatsApp no usa Jev como puerta de aprobación segura');
for(const id of ['guardian','inbox','qualify']){
  const a=agents.agents?.find(x=>x.id===id);
  ok(a?.decision_model==='jev-latest'&&a?.decision_provider==='typesafe','El agente '+id+' no tiene Jev como motor de decisión');
}

if(errors.length){
  console.error('\nMETA_JEV_VERIFY_FAIL\n- '+errors.join('\n- '));
  process.exit(1);
}
console.log('META_JEV_VERIFY_OK · Meta v26 + OAuth + lectura unificada + Jev routing y aprobación WhatsApp verificados.');
