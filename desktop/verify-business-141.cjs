'use strict';
const fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,p),'utf8');
const master=read('master.cjs');
const preload=read('preload.cjs');
const prospecting=read('prospecting.cjs');
const home=read('renderer/agent-home.js');
const html=read('renderer/index.html');
const onboarding=read('renderer/business-onboarding.js');
function need(src,re,msg){if(!re.test(src)){console.error('BUSINESS_141_VERIFY_FAIL:',msg);process.exit(1)}}
function forbid(src,re,msg){if(re.test(src)){console.error('BUSINESS_141_VERIFY_FAIL:',msg);process.exit(1)}}

need(master,/state\.secret\.businessProfiles/,'business profiles must live in encrypted secret state');
need(master,/activeBusinessProfileId/,'active business profile id missing');
need(master,/business:list/,'business list IPC missing');
need(master,/business:save-all/,'business onboarding save IPC missing');
need(master,/business:set-active/,'active business switch IPC missing');
need(master,/business:suggest-targets/,'AI target-customer suggestion IPC missing');
need(master,/PERFIL DE NEGOCIO CONFIRMADO POR EL USUARIO/,'business AI context contract missing');
need(master,/localContext\.unshift\(\{path:'PERFIL EMPRESA ACTIVA/,'active business profile must be injected into AI context');
need(master,/assertBusinessSourceCompatibility/,'cross-company source isolation missing');
need(master,/Gestionar perfiles/,'source mismatch must explain how to fix company mapping');

need(preload,/businessList:/,'business list bridge missing');
need(preload,/businessSaveAll:/,'business save-all bridge missing');
need(preload,/businessSetActive:/,'active company bridge missing');
need(preload,/businessSuggestTargets:/,'AI target suggestion bridge missing');

need(prospecting,/applyBusinessProfile/,'prospecting must receive the active business profile');
need(prospecting,/searchWithBusinessContext/,'prospecting search must use business context');
need(prospecting,/Clientes objetivo confirmados/,'prospecting must prioritize confirmed customer types');

need(html,/business-onboarding\.js/,'business onboarding script not loaded');
need(onboarding,/¿Cuántas empresas vas a gestionar\?/,'company-count onboarding step missing');
need(onboarding,/Sectores en los que trabaja/,'business sectors field missing');
need(onboarding,/Productos o servicios principales/,'products and services field missing');
need(onboarding,/Marcas propias o distribuidas/,'brands field missing');
need(onboarding,/Tipos de cliente objetivo/,'target customer field missing');
need(onboarding,/Modelo comercial/,'B2B-B2C model field missing');
need(onboarding,/Zona donde vende/,'sales area field missing');
need(onboarding,/Canales de venta/,'sales channels field missing');
need(onboarding,/Objetivos principales/,'business goals field missing');
need(onboarding,/Conexiones asociadas a esta empresa/,'per-company connection mapping missing');
need(onboarding,/Sugerir clientes objetivo con IA/,'AI target-customer suggestion button missing');
need(onboarding,/businessSetActive/,'top company selector must change the active profile');
need(onboarding,/needsOnboarding/,'first-run business onboarding trigger missing');
need(home,/window\.vnxBusiness\?\.activeProfile/,'agent workspace must consume active business profile');
need(home,/business\?\.targetCustomers/,'captation target field must default from business profile');
need(home,/business\.productsServices/,'agent product defaults must use business profile');
need(home,/business\.brands/,'agent brand defaults must use business profile');
forbid(home,/\['Sector',\['Todos','Farmacias','Clínicas','Distribuidores'\]\]/,'generic hardcoded sector dropdown must not return');

console.log('BUSINESS_141_VERIFY_OK');
