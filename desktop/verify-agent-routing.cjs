const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {normalizeChatScope,emailAgentDirectReply}=require('./agent-email.cjs');

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

const master=fs.readFileSync(path.join(__dirname,'master.cjs'),'utf8');
assert.match(master,/normalizeChatScope/);
assert.match(master,/emailAgentDirectReply/);
assert.match(master,/No se mezclarán datos de otras conexiones/);
assert.doesNotMatch(master,/gmailDirectReply\(question,localContext/);

const renderer=fs.readFileSync(path.join(__dirname,'renderer','master.js'),'utf8');
assert.match(renderer,/type:'agent',key:item\.key/);
assert.match(renderer,/window\.vnxRefreshAgentUi=refreshChatConnections/);

const app=fs.readFileSync(path.join(__dirname,'renderer','app.js'),'utf8');
assert.doesNotMatch(app,/Selecciona una conexión…|VentaNexIA consultará este correo para responder con datos reales/);

console.log('VentaNexIA agent routing verify OK: Email aislado, priorización correcta y sin mezcla con portales.');
