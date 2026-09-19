const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {normalizeChatScope,emailAgentDirectReply}=require('./agent-email.cjs');
const {AGENT_CATALOG,isAgentIncluded,isMaster}=require('./agent-policy.cjs');

assert.deepEqual(normalizeChatScope('agent:email'),{type:'agent',key:'email'});
assert.equal(normalizeChatScope({type:'agent',key:'email'}).key,'email');
assert.equal(normalizeChatScope('portal:abc').type,'portal');

const gmailContext=[{
  path:'GMAIL ventas.ecojafer@gmail.com',
  content:[
    'FUENTE: Gmail autorizado por el usuario.',
    'CUENTA: ventas.ecojafer@gmail.com',
    'TOTAL_COINCIDENCIAS: 4',
    '',
    'Correo 1',
    'De: billing@example.com',
    'Asunto: Falló el pago de una factura',
    'Fecha: hoy',
    'Estado: NO LEÍDO · IMPORTANTE',
    'Vista previa: No pudimos procesar el pago de la última factura.',
    '',
    'Correo 2',
    'De: supplier@example.com',
    'Asunto: UBM Medical-Equipment',
    'Fecha: hoy',
    'Estado: NO LEÍDO · IMPORTANTE',
    'Vista previa: We specialize in high-quality medical furniture and would like to discuss cooperation.',
    '',
    'Correo 3',
    'De: linkedin@example.com',
    'Asunto: Has aparecido en 1 búsquedas esta semana',
    'Fecha: hoy',
    'Estado: NO LEÍDO',
    'Vista previa: LinkedIn recomendaciones de tu red.',
    '',
    'Correo 4',
    'De: instagram@example.com',
    'Asunto: explora cuentas en tu feed',
    'Fecha: hoy',
    'Estado: NO LEÍDO',
    'Vista previa: Instagram sugerencias para ti.'
  ].join('\n')
},{
  path:'PORTAL Mobiliariosanitario · dashboard',
  content:'productos pedidos imágenes dashboard'
}];

const reply=emailAgentDirectReply('que emails requieren mi atencion',gmailContext);
assert.ok(reply,'Debe responder directamente a consultas de atención');
assert.match(reply,/Falló el pago de una factura/);
assert.match(reply,/UBM Medical-Equipment/);
assert.doesNotMatch(reply,/Mobiliariosanitario|dashboard|productos pedidos/i);
assert.ok(reply.indexOf('Falló el pago')<reply.indexOf('UBM Medical-Equipment'),'El fallo de pago debe priorizarse');

const replyNeeded=emailAgentDirectReply('cuantos emails tenemos que responder',gmailContext);
assert.ok(replyNeeded,'Debe responder a cuántos emails requieren respuesta');
assert.match(replyNeeded,/Hay 1 que parecen requerir respuesta|Hay 1 que parece requerir respuesta|Hay 1/i);
assert.match(replyNeeded,/UBM Medical-Equipment/);
assert.doesNotMatch(replyNeeded,/Falló el pago de una factura.*requieren respuesta|Mobiliariosanitario|dashboard/i);

const multiContext=[...gmailContext,{
  path:'GMAIL info@segundaempresa.com',
  content:[
    'FUENTE: Gmail autorizado por el usuario.',
    'CUENTA: info@segundaempresa.com',
    'TOTAL_COINCIDENCIAS: 1',
    '',
    'Correo 1',
    'De: cliente@example.com',
    'Asunto: Consulta sobre presupuesto',
    'Fecha: hoy',
    'Estado: NO LEÍDO',
    'Vista previa: Hola, ¿podéis confirmarme el precio y disponibilidad?'
  ].join('\n')
}];
const multiReply=emailAgentDirectReply('cuantos emails tenemos que responder',multiContext);
assert.match(multiReply,/Hay 2/i,'Debe sumar correos que requieren respuesta de varias cuentas');
assert.match(multiReply,/ventas\.ecojafer@gmail\.com/);
assert.match(multiReply,/info@segundaempresa\.com/);

const replyClassificationContext=[{
  path:'GMAIL ventas.ecojafer@gmail.com',
  content:[
    'FUENTE: Gmail autorizado por el usuario.',
    'CUENTA: ventas.ecojafer@gmail.com',
    'TOTAL_COINCIDENCIAS: 4',
    '',
    'Correo 1',
    'De: Shopify <mailer@shopify.com>',
    'Asunto: Código de verificación de Shopify',
    'Fecha: hoy',
    'Estado: NO LEÍDO · IMPORTANTE',
    'Vista previa: Usa este código por única vez para continuar: 418696. Este código vence en 10 minutos. No compartas.',
    '',
    'Correo 2',
    'De: Vercel <notifications@vercel.com>',
    'Asunto: New sign-in detected on your Vercel account',
    'Fecha: hoy',
    'Estado: NO LEÍDO · IMPORTANTE',
    'Vista previa: Your account was recently signed-in from a new location.',
    '',
    'Correo 3',
    'De: eco jafer <ecojafer@gmail.com>',
    'Asunto: mobiliario sanitario',
    'Fecha: hoy',
    'Estado: IMPORTANTE',
    'Vista previa: necesito que me mandes el catalogo',
    '',
    'Correo 4',
    'De: OpenAI <noreply@email.openai.com>',
    'Asunto: Product update',
    'Fecha: hoy',
    'Estado: NO LEÍDO',
    'Vista previa: Newsletter informativa.'
  ].join('\n')
}];
const needsReply=emailAgentDirectReply('que correos requieren respuesta',replyClassificationContext);
assert.match(needsReply,/mobiliario sanitario/i,'La petición humana de catálogo debe requerir respuesta');
assert.doesNotMatch(needsReply,/Código de verificación|New sign-in detected|Product update/i,'OTP, seguridad y newsletters no deben aparecer como correos que requieren respuesta');

const masterLicense={plan:'master',featurePolicy:{}};
assert.equal(isMaster(masterLicense),true);
for(const agent of AGENT_CATALOG)assert.equal(isAgentIncluded(masterLicense,agent.key),true,'Maestro debe incluir '+agent.key);
const clientLicense={plan:'start',featurePolicy:{purchased_included:['email','agenda','atencion'],purchased_extras:[]}};
assert.equal(isAgentIncluded(clientLicense,'email'),true);
assert.equal(isAgentIncluded(clientLicense,'agenda'),true);
assert.equal(isAgentIncluded(clientLicense,'social'),false);
assert.equal(isAgentIncluded(clientLicense,'whatsapp'),false);

const master=fs.readFileSync(path.join(__dirname,'master.cjs'),'utf8');
const main=fs.readFileSync(path.join(__dirname,'main.cjs'),'utf8');
const entry=fs.readFileSync(path.join(__dirname,'master-entry.cjs'),'utf8');
assert.match(master,/normalizeChatScope/);
assert.match(master,/emailAgentDirectReply/);
assert.match(master,/No se mezclarán datos de otras conexiones/);
assert.doesNotMatch(master,/gmailDirectReply\(question,localContext/);
assert.match(master,/assertAgentIncluded\(s\.license,scope\.key\)/);
assert.match(master,/ipcMain\.handle\('agent:catalog'/);
assert.match(master,/emailAccountsForState/);
assert.match(master,/for\(const integration of integrations\)/,'El Agente Email debe recorrer todas las cuentas conectadas');
const handlerCount=(main.match(/ipcMain\.handle\('chat:send'/g)||[]).length+(master.match(/ipcMain\.handle\('chat:send'/g)||[]).length;
assert.equal(handlerCount,1,'Debe existir un único handler chat:send');
assert.doesNotMatch(main,/ipcMain\.handle\('chat:send'/,'main.cjs no debe registrar chat:send');
assert.doesNotMatch(master,/renderer','master\.js/,'master.js no debe inyectarse una segunda vez');
assert.match(entry,/const PORTAL_SCOPE_TYPES=new Set\(\['portal','url','folder','shopify','integration'\]\)/);
assert.match(entry,/if\(type==='agent'\|\|!type\)return agentChat/,'Los agentes deben ir siempre a master.cjs');
assert.match(entry,/type==='integration'.*scope\?\.key.*email[\s\S]*return agentChat/,'Email individual del Centro Maestro debe respetar accountIndex en master.cjs');
assert.match(entry,/if\(PORTAL_SCOPE_TYPES\.has\(type\)\)return portalChat/);
assert.match(entry,/ipcMain\.removeHandler\('chat:send'\)/);
assert.match(entry,/originalHandle\('chat:send'/);

const renderer=fs.readFileSync(path.join(__dirname,'renderer','master.js'),'utf8');
assert.match(renderer,/type:'agent',key:item\.key/);
assert.match(renderer,/window\.vnxRefreshAgentUi=refreshChatConnections/);
assert.match(renderer,/window\.vnx\.agentCatalog/);
assert.doesNotMatch(renderer,/allItems\.filter\(x=>x\.connected\)/,'El desplegable no puede ocultar agentes no conectados');
assert.match(renderer,/No incluido en tu plan/);
assert.doesNotMatch(renderer,/Object\.entries\(real\)/,'El panel central no puede reconstruir conexiones desde localStorage');

assert.match(main,/emailAccountsFromState/);
assert.match(main,/addMasterEmailAccount/);
assert.match(main,/isMaster\(s\.license\).*unlimited/s,'Maestro debe evitar consumos limitados');
assert.match(main,/s\.secret\.emailAccounts=\[\]/,'Desconectar Email debe limpiar todas las cuentas del Maestro');
assert.match(main,/accountIndex:i/,'Cada cuenta Email del Maestro debe aparecer separada en el panel central');
assert.match(master,/scope\?\.accountIndex/,'El panel central debe consultar la cuenta Email elegida, no todas');
assert.match(master,/function isShopifyAdminUrl/);
assert.match(master,/admin\.shopify\.com/);
assert.match(master,/Shopify no debe conectarse como portal del navegador/);
assert.match(master,/portal\.cleanup/);

const app=fs.readFileSync(path.join(__dirname,'renderer','app.js'),'utf8');
assert.doesNotMatch(app,/Selecciona una conexión…|VentaNexIA consultará este correo para responder con datos reales/);
assert.match(app,/Maestro: cuentas de email ilimitadas/);
assert.match(app,/await refreshChatConnections\(\)/,'Desconectar debe refrescar agentes y Centro Maestro inmediatamente');
assert.match(app,/account\.value=''/,'Desconectar Email debe limpiar el correo mostrado en el formulario');
const html=fs.readFileSync(path.join(__dirname,'renderer','index.html'),'utf8');
assert.match(html,/id="emailAccountPolicyText"/);
assert.doesNotMatch(renderer,/admin\.shopify\.com.*out\.push\(\{type:'portal'/s,'Shopify Admin no puede aparecer como portal del Centro Maestro');

console.log('VentaNexIA agent routing verify OK: Email aislado, varias cuentas Maestro, desconexión autoritativa, catálogo completo y límites de cliente.');
