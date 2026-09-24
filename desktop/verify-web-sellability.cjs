'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const errors=[];
const ok=(v,msg)=>{if(!v)errors.push(msg)};

const pkg=JSON.parse(fs.readFileSync(path.join(__dirname,'package.json'),'utf8'));
const home=read('index.html'),plans=read('planes.html'),builder=read('assets/builder.js'),constructor=read('constructor.html');
const contract=read('contrato-servicio.html'),checkout=read('checkout.html'),router=read('api/router.js');
const checkoutHandler=read('server/handlers/create-checkout.js'),trialHandler=read('server/handlers/start-trial.js');
const pricingLib=read('lib/pricing.js'),pricingCfg=JSON.parse(read('config/pricing.json'));
const sitemap=read('sitemap.xml'),robots=read('robots.txt'),mobileHtml=read('app/index.html'),mobileJs=read('app/app.js');

function priceFromLib(key){
  const m=pricingLib.match(new RegExp(key+':\\{[^}]*monthly:(\\d+)[^}]*integrations:(\\d+)[^}]*devices:(\\d+)[^}]*orderLimit:(\\d+)'));
  return m?{monthly:Number(m[1]),integrations:Number(m[2]),devices:Number(m[3]),orders:Number(m[4])}:null;
}
function priceFromPlans(key){
  const map={start:'inicio',core:'crecimiento',scale:'empresa'},name=map[key];
  const m=plans.match(new RegExp(name+":\\{name:'[^']+',price:(\\d+)[^}]*connections:(\\d+),devices:(\\d+),orderLimit:(\\d+)"));
  return m?{monthly:Number(m[1]),integrations:Number(m[2]),devices:Number(m[3]),orders:Number(m[4])}:null;
}
function amountFromCheckout(key){
  const m=checkoutHandler.match(new RegExp(key+":\\{product:[^,]+,expectedAmount:(\\d+)"));
  return m?Number(m[1])/100:null;
}
for(const key of ['start','core','scale']){
  const lib=priceFromLib(key),page=priceFromPlans(key),cfg=pricingCfg.plans[key],stripe=amountFromCheckout(key);
  ok(lib&&page&&cfg&&stripe,'Precio: no se pudo leer '+key+' en todas las fuentes');
  if(lib&&page&&cfg&&stripe){
    ok(lib.monthly===page.monthly&&lib.monthly===Number(cfg.monthly)&&lib.monthly===stripe,'Precio incoherente en '+key+': lib '+lib.monthly+', página '+page.monthly+', config '+cfg.monthly+', checkout '+stripe);
    ok(lib.integrations===page.integrations&&lib.integrations===Number(cfg.integrations_included),'Límite de conexiones incoherente en '+key);
    ok(lib.devices===page.devices&&lib.devices===Number(cfg.devices_included),'Límite de dispositivos incoherente en '+key);
  }
}
ok(Number(pricingCfg.addons.storage_pack?.monthly)===29,'Extra de almacenamiento debe coincidir con carrito/checkout (29 €)');
ok(Number(pricingCfg.addons.order_pack?.monthly)===39,'Extra de 500 pedidos debe coincidir con carrito/checkout (39 €)');

ok(home.includes('/planes.html')&&home.includes('Probar 15 días gratis'),'Portada sin CTA visible a la prueba');
ok(home.includes('G-FJNCZDCE7Q'),'Google Analytics no está instalado en portada');
ok(home.includes('https://www.ventanexia.es/')&&home.includes('application/ld+json'),'SEO básico de portada incompleto');
ok(home.includes('VENTANEXIA DESKTOP '+pkg.version),'La portada no muestra la versión Desktop actual '+pkg.version);
ok(plans.includes("location.href='/constructor.html?plan='"),'Planes no llevan al constructor para iniciar prueba');
ok(constructor.includes('id="startTrial"')&&constructor.includes('/assets/builder.js'),'Constructor no expone activación de prueba');
ok(builder.includes('fetch("/api/solution-builder"')&&builder.includes('fetch("/api/start-trial"'),'Constructor no conecta propuesta y activación de prueba');
ok(trialHandler.includes('trialTermsAccepted')&&trialHandler.includes('noChargeAccepted'),'Backend de prueba no exige aceptaciones');
ok(router.includes('"solution-builder"')&&router.includes('"start-trial"'),'Router API no publica el embudo de prueba');
ok(contract.includes("endpoint=contract-accept")&&contract.includes("location.href='/checkout.html'"),'Contrato no enlaza con checkout');
ok(checkout.includes('endpoint=create-checkout')&&checkout.includes('vnx_contract_token'),'Checkout no usa contrato aceptado');
ok(checkoutHandler.includes('STRIPE_SECRET_KEY')&&checkoutHandler.includes('mode:"subscription"'),'Backend de checkout Stripe incompleto');

for(const url of ['/','/planes.html','/por-que-ventanexia.html','/demos-funciones.html','/captador-clientes-ia.html','/apps-a-medida.html']){
  const loc='https://www.ventanexia.es'+(url==='/'?'/':url);
  ok(sitemap.includes('<loc>'+loc+'</loc>'),'Sitemap no incluye '+url);
}
ok(/User-agent:\s*\*/i.test(robots)&&/Allow:\s*\//i.test(robots)&&/Sitemap:\s*https:\/\/www\.ventanexia\.es\/sitemap\.xml/i.test(robots),'robots.txt no permite rastreo o no declara sitemap');

ok((mobileHtml.match(/data-mobile-desktop=/g)||[]).length===5,'Móvil: las 5 conexiones deben tener acción real/explicativa');
ok((mobileHtml.match(/data-mobile-chat=/g)||[]).length===3,'Móvil: Web y tienda debe tener acciones reales hacia Carla');
ok(!mobileHtml.includes('<span>Datos reales</span>'),'Móvil no debe afirmar datos reales que no sincroniza');
ok(mobileJs.includes("function privateChatBody")&&mobileJs.includes("activationCode:session.activationCode")&&mobileJs.includes("scope:'agent:core_ai'"),'Móvil: Carla no está autenticada contra licencia');
ok(!mobileJs.includes("localStorage.setItem('vnx_mobile_saved_session'"),'Móvil no debe persistir la sesión con código de activación');
ok(mobileJs.includes("localStorage.setItem('vnx_mobile_saved_id'"),'Móvil debería recordar solo el ID cuando el usuario lo pide');

if(errors.length){
  console.error('\nWEB_SELLABILITY_VERIFY_FAIL\n- '+errors.join('\n- '));
  process.exit(1);
}
console.log('WEB_SELLABILITY_VERIFY_OK · precios, trial, contrato, Stripe, SEO/sitemap y móvil verificados.');
