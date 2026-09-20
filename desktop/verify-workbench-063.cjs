'use strict';
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,p),'utf8');
const html=read('renderer/index.html');
const js=read('renderer/master.js');
const css=read('renderer/styles.css');
const server=fs.readFileSync(path.join(__dirname,'..','server','handlers','chat-desktop-router.js'),'utf8');

const checks=[
  ['workbench shell',html.includes('class="vnx-workbench"')],
  ['large three-column workspace',html.includes('vnx-workbench-grid')&&html.includes('vnx-workbench-rail')],
  ['guided/free switch preserved',html.includes('id="guidedModeBtn"')&&html.includes('id="freeModeBtn"')],
  ['agent ribbon preserved',html.includes('id="guidedAgentTabs"')],
  ['Secretary quick actions',html.includes('data-secretary-day')&&html.includes('data-secretary-pending')&&html.includes('data-secretary-work')],
  ['email translation UI',html.includes('id="vnxTranslateEmailsBtn"')&&html.includes('id="vnxTranslationLanguage"')],
  ['real agenda rail',html.includes('id="vnxAgendaList"')&&js.includes('refreshWorkbenchAgenda')],
  ['real connections rail',html.includes('data-vnx-connect="email"')&&js.includes('refreshWorkbenchConnections')],
  ['approval rail',html.includes('id="vnxApprovalsList"')&&js.includes('refreshWorkbenchApprovals')],
  ['translation logic',js.includes('autoTranslateFreshEmails')&&js.includes('runEmailWorkbench')],
  ['Email guided translation fields',js.includes("key:'translation'")&&js.includes("key:'language'")],
  ['plain missing-connection explanation',server.includes('Lo que sí puedo hacer ahora')&&server.includes('Siguiente paso recomendado')],
  ['responsive workbench CSS',css.includes('0.6.63 — Executive Workbench')&&css.includes('@media(max-width:650px)')],
  ['old duplicated Secretary bar disabled',!js.includes("bar.className='vnx-secretary-bar'")]
];
const failed=checks.filter(([,ok])=>!ok);
if(failed.length){console.error('0.6.63 workbench verification failed:',failed.map(x=>x[0]).join(', '));process.exit(1)}
console.log('VentaNexIA 0.6.63 workbench verification OK · guided/free, agents, translations, agenda, approvals and connections present.');
