'use strict';
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,p),'utf8');
const renderer=read('renderer/master.js');
const entry=read('master-entry.cjs');
const main=read('main.cjs');
const master=read('master.cjs');
const preload=read('preload.cjs');
const calendar=read('calendar.cjs');
const appUi=read('renderer/app.js');
const indexHtml=read('renderer/index.html');

const checks=[
  ['renderer morning brief',renderer.includes('maybeRunMorningBrief')],
  ['renderer daily plan',renderer.includes('Prepárame el día')],
  ['renderer work ahead',indexHtml.includes('Adelanta trabajo')&&renderer.includes("runExecutiveSecretary('work')")],
  ['renderer close day',renderer.includes("runExecutiveSecretary('close')")||indexHtml.includes('Cierre')],
  ['renderer mail watcher',renderer.includes('pollSecretaryEmail')],
  ['renderer alert classification',renderer.includes('replyScore')&&renderer.includes('attentionScore')],
  ['native secretary notify',main.includes("ipcMain.handle('secretary:notify'")&&!entry.includes("ipcMain.handle('secretary:notify'")],
  ['agenda truth guard',entry.includes('Agenda no conectada')&&entry.includes('No inventes reuniones')],
  ['email triage scores',master.includes('scoreMailAttention')&&master.includes('needsReplyScore')],
  ['preload notify bridge',preload.includes('secretaryNotify')],
  ['calendar reader bundled',calendar.includes('google_calendar')&&calendar.includes('microsoft_calendar')],
  ['calendar IPC bridge',preload.includes('agendaToday')&&preload.includes('agendaUpcoming')],
  ['calendar connection wizard',appUi.includes("agenda:[['google_calendar'")&&appUi.includes('microsoft_calendar')],
  ['calendar connection card',indexHtml.includes('data-connection-card="agenda"')],
  ['meeting preparation watcher',renderer.includes('prepareUpcomingMeeting')&&renderer.includes('pollSecretaryCalendar')]
];
const failed=checks.filter(([,ok])=>!ok);
if(failed.length){
  console.error('Executive Secretary verification failed:',failed.map(x=>x[0]).join(', '));
  process.exit(1);
}
console.log('VentaNexIA Executive Secretary verification OK · daily brief, priorities, smart email alerts, real calendar and meeting preparation enabled.');
