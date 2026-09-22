'use strict';
const fs=require('node:fs');
const path=require('node:path');

const root=__dirname;
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

const runtimeFiles=[
  'main.cjs','master-entry.cjs','master.cjs','preload.cjs','state-store.cjs',
  'agent-email.cjs','gmail-auth.cjs','shopify-auth.cjs','calendar.cjs','external-agent.cjs',
  'agent-policy.cjs','prospecting.cjs','orders.cjs','orders-core.cjs','order-files.cjs',
  'erp.cjs','export.cjs','portal-adaptive.cjs','portal-pagination-fix.cjs',
  'renderer/app.js','renderer/master.js','renderer/adaptive.js','renderer/export.js','renderer/master-control.js'
].filter(p=>fs.existsSync(path.join(root,p)));

const source=runtimeFiles.map(p=>'\n// '+p+'\n'+read(p)).join('\n');
const failures=[];

const forbiddenNames=[
  'SUPABASE_SERVICE_ROLE_KEY','STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET',
  'OPENAI_API_KEY','RESEND_API_KEY','N8N_AUTOMATION_WEBHOOK'
];
for(const name of forbiddenNames)if(source.includes(name))failures.push('El cliente contiene referencia a secreto de servidor: '+name);

const rawSecretPatterns=[
  /sk_live_[A-Za-z0-9]{12,}/,
  /sk_test_[A-Za-z0-9]{12,}/,
  /sb_secret_[A-Za-z0-9_-]{12,}/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/
];
for(const re of rawSecretPatterns)if(re.test(source))failures.push('Se ha detectado un patrón de credencial privada: '+re);

const main=read('main.cjs');
for(const required of [
  'contextIsolation:true,nodeIntegration:false,sandbox:true',
  'webSecurity:true,allowRunningInsecureContent:false',
  'devTools:false'
])if(!main.includes(required))failures.push('Falta endurecimiento Electron: '+required);

const stateStore=read('state-store.cjs');
if(!stateStore.includes('safeStorage.encryptString')||!stateStore.includes('safeStorage.decryptString'))failures.push('Las credenciales locales no están protegidas con safeStorage');

if(pkg.build?.asar!==true)failures.push('ASAR debe estar activado');
const fuses=pkg.build?.electronFuses||{};
for(const [key,val] of Object.entries({
  runAsNode:false,
  enableCookieEncryption:true,
  enableNodeOptionsEnvironmentVariable:false,
  enableNodeCliInspectArguments:false,
  enableEmbeddedAsarIntegrityValidation:true,
  onlyLoadAppFromAsar:true
}))if(fuses[key]!==val)failures.push('Fuse Electron incorrecto: '+key);

const shipped=Array.isArray(pkg.build?.files)?pkg.build.files:[];
for(const p of shipped){
  if(/^verify-.*\.cjs$/i.test(p)||/^smoke-.*\.cjs$/i.test(p))failures.push('No enviar verificadores internos al cliente: '+p);
  if(/\.map$/i.test(p))failures.push('No enviar source maps al cliente: '+p);
}

if(failures.length){
  console.error('VentaNexIA security verification failed:\n- '+failures.join('\n- '));
  process.exit(1);
}
console.log('VentaNexIA security verification OK · sin secretos de servidor, Electron endurecido, safeStorage activo y verificadores internos fuera del instalador.');
