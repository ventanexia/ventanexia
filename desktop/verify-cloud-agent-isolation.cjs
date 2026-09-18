const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');

(async()=>{
  const mod=await import(pathToFileURL(path.join(__dirname,'..','server','handlers','chat-desktop-router.js')).href+'?verify='+Date.now());
  const handler=mod.default;

  function makeRes(){
    return {
      statusCode:200,
      body:null,
      status(code){this.statusCode=code;return this},
      json(value){this.body=value;return this}
    };
  }

  const mixedContext=[
    {
      path:'GMAIL ventas.ecojafer@gmail.com',
      content:[
        'FUENTE: Gmail autorizado por el usuario.',
        'CUENTA: ventas.ecojafer@gmail.com',
        'TOTAL_COINCIDENCIAS: 2',
        '',
        'Correo 1',
        'De: pedidos@cliente.com',
        'Asunto: Pedido 1042 - confirmación',
        'Fecha: hoy',
        'Estado: NO LEÍDO · IMPORTANTE',
        'Vista previa: Hola, ¿podéis confirmar la entrega de este pedido?',
        '',
        'Correo 2',
        'De: newsletter@example.com',
        'Asunto: Noticias de la semana',
        'Fecha: hoy',
        'Estado: leído',
        'Vista previa: Novedades generales.'
      ].join('\n')
    },
    {
      path:'PORTAL CONEXION Naturdesma agentes · orders',
      content:'PEDIDOS: 9999. Naturdesma. No debe ser visible desde Email.'
    },
    {
      path:'PORTAL CONEXION Mobiliariosanitario · orders',
      content:'PEDIDOS: 8888. Mobiliariosanitario. No debe ser visible desde Email.'
    }
  ];

  const req={
    method:'POST',
    body:{
      desktop:{customerId:'MASTER'},
      scope:'agent:email',
      messages:[{role:'user',content:'dime cuantos pedidos han entrado hoy'}],
      localContext:mixedContext
    }
  };
  const res=makeRes();
  await handler(req,res);
  assert.equal(res.statusCode,200);
  assert.ok(res.body?.reply);
  assert.match(res.body.reply,/correo seleccionado|mensajes relacionados con pedidos|pedido/i);
  assert.doesNotMatch(res.body.reply,/Naturdesma|Mobiliariosanitario|9999|8888/i,'El Agente Email no puede mezclar portales');
  assert.equal(res.body.route,'agent:email');
  assert.equal(res.body.source,'desktop-email-direct');

  const noEmailReq={
    method:'POST',
    body:{
      desktop:{customerId:'MASTER'},
      scope:'agent:email',
      messages:[{role:'user',content:'dime cuantos pedidos han entrado hoy'}],
      localContext:[mixedContext[1],mixedContext[2]]
    }
  };
  const noEmailRes=makeRes();
  await handler(noEmailReq,noEmailRes);
  assert.match(noEmailRes.body.reply,/no he recibido datos de ninguna cuenta de correo/i);
  assert.doesNotMatch(noEmailRes.body.reply,/Naturdesma|Mobiliariosanitario|9999|8888/i);

  console.log('VentaNexIA cloud agent isolation OK: agent:email ignora Naturdesma, MobiliarioSanitario y cualquier portal.');
})().catch(err=>{console.error(err);process.exit(1)});
