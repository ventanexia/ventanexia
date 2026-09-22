'use strict';
const fs=require('node:fs'),path=require('node:path');
const css=fs.readFileSync(path.join(__dirname,'renderer','styles.css'),'utf8');
const js=fs.readFileSync(path.join(__dirname,'renderer','master.js'),'utf8');
function need(src,re,msg){if(!re.test(src)){console.error('REDESIGN_VERIFY_FAIL:',msg);process.exit(1)}}
need(css,/\.vnx-carla-window:not\(:has\(\.email-dashboard-mode\)\) #chatSourceGlobal\{[\s\S]*display:grid!important/,'Carla connection selector layout missing');
need(css,/\.vnx-carla-window:not\(:has\(\.email-dashboard-mode\)\) #chatSourceHint\{[\s\S]*display:block!important/,'Carla isolation hint must stay visible');
need(js,/Usaré únicamente esta conexión\./,'Carla strict-source hint text missing');
need(css,/\.vnx-carla-window:has\(\.email-dashboard-mode\) \.email-workspace\{[\s\S]*grid-template-columns/,'Email dashboard split layout missing');
need(css,/\.vnx-carla-window:has\(\.email-dashboard-mode\) \.email-category-panel/,'Email category tabs layout missing');
need(css,/\.vnx-carla-window:has\(\.email-dashboard-mode\) \.email-list\{[\s\S]*overflow-y:auto/,'Email list must remain independently scrollable');
need(js,/email-dashboard-mode/,'Email dashboard renderer mode missing');
console.log('REDESIGN_VERIFY_OK');
