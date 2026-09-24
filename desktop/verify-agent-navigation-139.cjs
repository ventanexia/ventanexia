'use strict';
const fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,p),'utf8');
const home=read('renderer/agent-home.js');
const html=read('renderer/index.html');
const app=read('renderer/app.js');
function need(src,re,msg){if(!re.test(src)){console.error('AGENT_139_VERIFY_FAIL:',msg);process.exit(1)}}
function forbid(src,re,msg){if(re.test(src)){console.error('AGENT_139_VERIFY_FAIL:',msg);process.exit(1)}}

forbid(home,/\$\$\$\(/,'undefined $$$ selector helper remains');
need(home,/document\.querySelectorAll\('\.vnx-agent-side-btn'\)\.forEach/,'sidebar agent buttons must bind with a real NodeList selector');
need(app,/closest\?\.\('\[data-agent-home\]'\)/,'app.js must keep delegated sidebar fallback');
need(home,/function agentScreenUi\(key\)/,'agent-specific screen configuration missing');
need(home,/function applyAgentScreenUi\(key,cfg\)/,'agent-specific UI renderer missing');

const agents=['email','orders','web_ecommerce','crm','prospecting','content','social','campaigns','administration','agenda','reports','automation'];
for(const key of agents){
  need(html,new RegExp('data-agent-home="'+key.replace('_','_')+'"'),'left menu missing '+key);
  need(home,new RegExp('\\n\\s*'+key+':\\{'),'workspace config missing '+key);
}
need(home,/title:'Agente de Correo con IA'/,'email screen title missing');
need(home,/title:'Agente de Stock y Compras'/,'stock screen title missing');
need(home,/title:'Agente de Redes Sociales'/,'social screen title missing');
need(home,/title:'Agente de Informes'/,'reports screen title missing');
need(home,/sourceTabs:\['Stock actual','Ventas 6 meses','Importar Excel\/CSV'\]/,'stock-specific source tabs missing');
need(home,/\['Fabricante',\['Todos los fabricantes','Fabricante seleccionado'\]\]/,'stock manufacturer filter missing');
need(home,/sourceTabs:\['Bandeja conectada','Necesitan respuesta','Buscar correo'\]/,'email-specific source tabs missing');
need(home,/\['Cuenta',\['Todas las cuentas','Cuenta seleccionada'\]\]/,'email account filter missing');
need(home,/sourceTabs:\['Calendario','Publicaciones','Creatividades'\]/,'social-specific controls missing');
need(home,/sourceTabs:\['Datos conectados','Comparativas','Importar Excel\/CSV'\]/,'reports-specific controls missing');
need(home,/dataset\.vnxHomeAgent=key[\s\S]{0,120}applyAgentScreenUi\(key,cfg\)/,'agent change must repaint the full workspace');
need(home,/selectAgentInWorkbench\(cfg\.chatKey/,'opening workbench must switch to the requested agent');
need(home,/startsWith\('agent:'\+wanted\+':'\)/,'agent selector must support suffixed account values');
need(html,/id="vnxAhConfigTitle"/,'dynamic configuration title hook missing');
need(html,/id="vnxAhSourceTabs"/,'dynamic source tabs hook missing');
need(html,/id="vnxAhFilters"/,'dynamic filters hook missing');
need(html,/id="vnxAhSwitches"/,'dynamic execution controls hook missing');
need(home,/vnxAhSearchBtn[^\n]*addEventListener|'#vnxAhSearchBtn'/,'search action must remain wired');
need(home,/vnxAhPrimary[^\n]*addEventListener|'#vnxAhPrimary'/,'primary action must remain wired');
need(home,/vnxAhCompanyBtn[^\n]*addEventListener|'#vnxAhCompanyBtn'/,'company dropdown must remain wired');
console.log('AGENT_139_VERIFY_OK');
