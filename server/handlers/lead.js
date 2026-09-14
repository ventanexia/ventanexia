function clean(v,max=2000){return String(v||"").trim().slice(0,max)}

function scoreLead({empresa,necesidad,ticket,volumen,rol,plazo}){
  const detail={fit:0,intent:0,value:0,authority:0,timing:0};
  const company=clean(empresa,250);
  const need=clean(necesidad,3000).toLowerCase();
  const role=clean(rol,200).toLowerCase();
  const timing=clean(plazo,100).toLowerCase();
  const ticketValue=Number(ticket||0);
  const volumeValue=Number(volumen||0);

  // ICP fit — 30
  if(company) detail.fit+=15;
  if(/b2b|empresa|empresas|profesional|distribu|industrial|instalad|cl[ií]nic|software|servicio|comercial|venta|ventas/.test(need)) detail.fit+=15;

  // Intent / pain — 25
  if(need.length>=30) detail.intent+=10;
  if(/seguimiento|crm|lead|venta|ventas|comercial|automat|oportunidad|agenda|prospe|respuesta|conversion|captaci[oó]n/.test(need)) detail.intent+=15;

  // Economic value — 20
  detail.value += ticketValue>=5000?12:ticketValue>=1500?8:ticketValue>0?4:0;
  detail.value += volumeValue>=100?8:volumeValue>=30?5:volumeValue>0?2:0;

  // Authority — 15
  detail.authority=/dueñ|ceo|director|gerente|responsable|socio|administrador|fundador/.test(role)?15:role?7:0;

  // Timing — 10
  detail.timing=/ya|ahora|este mes|30|urgente|inmediato/.test(timing)?10:timing?5:0;

  const score=Math.min(100,Object.values(detail).reduce((a,b)=>a+b,0));
  const band=score>=85?"PRIORITY":score>=70?"QUALIFIED":score>=50?"NURTURE":"LOW_FIT";
  const nextBestAction=band==="PRIORITY"
    ?"Reunión de diagnóstico prioritaria"
    :band==="QUALIFIED"
      ?"Completar diagnóstico y proponer reunión"
      :band==="NURTURE"
        ?"Seguimiento educativo y revisión posterior"
        :"Validar encaje antes de invertir tiempo comercial";
  return {score,band,detail,nextBestAction};
}

function stageFor(score){return score>=85?"qualifiedtobuy":"appointmentscheduled"}
function leadStatusFor(score){return score>=70?"OPEN_DEAL":score>=50?"IN_PROGRESS":"NEW"}
function lifecycleFor(score){return score>=70?"salesqualifiedlead":"lead"}

async function hsFetch(url,options){
  const r=await fetch(url,options);
  let data={};
  try{data=await r.json()}catch{}
  if(!r.ok) throw new Error(data?.message||`${r.status} ${r.statusText}`);
  return data;
}

import crypto from "crypto";

export default async function handler(req,res){
  const correlationId=crypto.randomUUID();
  if(req.method!=="POST") return res.status(405).json({error:"Método no permitido",correlationId});

  const body=req.body||{};
  const empresa=clean(body.empresa,250);
  const nombre=clean(body.nombre,250);
  const email=clean(body.email,320).toLowerCase();
  const telefono=clean(body.telefono,80);
  const necesidad=clean(body.necesidad,3000);
  const consentimiento=body.consentimiento===true;
  const bookingUrl=clean(process.env.BOOKING_URL,1000);

  // Honeypot: respond as success so bots do not learn the rule.
  if(clean(body.website,200)) return res.status(200).json({ok:true});

  if(!empresa||!nombre||!email||!necesidad||!consentimiento){
    return res.status(400).json({error:"Faltan campos obligatorios"});
  }
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
    return res.status(400).json({error:"Email no válido"});
  }

  const token=process.env.HUBSPOT_ACCESS_TOKEN;
  if(!token) return res.status(503).json({code:"NOT_CONFIGURED",error:"CRM no configurado"});

  const qualification=scoreLead(body);
  const {score,band,nextBestAction}=qualification;
  const headers={"Authorization":`Bearer ${token}`,"Content-Type":"application/json"};

  try{
    let contactId=null;

    const search=await hsFetch("https://api.hubapi.com/crm/v3/objects/contacts/search",{
      method:"POST",headers,
      body:JSON.stringify({
        filterGroups:[{filters:[{propertyName:"email",operator:"EQ",value:email}]}],
        properties:["email","firstname","lastname","hs_lead_status","lifecyclestage"],
        limit:1
      })
    });
    if(search.total>0) contactId=search.results[0].id;

    const parts=nombre.split(/\s+/);
    const firstname=parts.shift()||nombre;
    const lastname=parts.join(" ");

    const contactProperties={
      email,firstname,lastname,phone:telefono,company:empresa,
      hs_lead_status:leadStatusFor(score),
      lifecyclestage:lifecycleFor(score)
    };

    if(!contactId){
      const created=await hsFetch("https://api.hubapi.com/crm/v3/objects/contacts",{
        method:"POST",headers,
        body:JSON.stringify({properties:contactProperties})
      });
      contactId=created.id;
    }else{
      await hsFetch(`https://api.hubapi.com/crm/v3/objects/contacts/${contactId}`,{
        method:"PATCH",headers,
        body:JSON.stringify({properties:contactProperties})
      });
    }

    // CRM policy: a form submission is not automatically an economic opportunity.
    // Only QUALIFIED / PRIORITY leads create a DEAL.
    if(score<70){
      console.log(JSON.stringify({event:"lead_accepted",correlationId,band,dealCreated:false,ts:new Date().toISOString()}));
      return res.status(200).json({
        ok:true,correlationId,
        contactId,
        dealCreated:false,
        qualification:{band,nextBestAction},
        bookingUrl:score>=70&&bookingUrl?bookingUrl:null
      });
    }

    // Idempotency guard: do not create another open web-diagnostic deal
    // with the same normalized name if one already exists.
    const dealName=`Diagnóstico VentaNexIA · ${empresa}`;
    const existingDeals=await hsFetch("https://api.hubapi.com/crm/v3/objects/deals/search",{
      method:"POST",headers,
      body:JSON.stringify({
        filterGroups:[{filters:[
          {propertyName:"dealname",operator:"EQ",value:dealName},
          {propertyName:"pipeline",operator:"EQ",value:"default"},
          {propertyName:"dealstage",operator:"NOT_IN",values:["closedwon","closedlost"]}
        ]}],
        properties:["dealname","dealstage","pipeline","hs_next_step","hs_priority"],
        limit:10
      })
    });

    if(existingDeals.total>0){
      const existing=existingDeals.results[0];
      await hsFetch(`https://api.hubapi.com/crm/v3/objects/deals/${existing.id}`,{
        method:"PATCH",headers,
        body:JSON.stringify({properties:{
          hs_priority:score>=85?"high":"medium",
          hs_next_step:nextBestAction
        }})
      });
      console.log(JSON.stringify({event:"lead_accepted",correlationId,band,dealCreated:false,dealUpdated:true,ts:new Date().toISOString()}));
      return res.status(200).json({
        ok:true,correlationId,
        contactId,
        dealId:existing.id,
        dealCreated:false,
        dealUpdated:true,
        qualification:{band,nextBestAction},
        bookingUrl:bookingUrl||null
      });
    }

    const desc=[
      "Solicitud web VentaNexIA",
      `Empresa: ${empresa}`,
      `Necesidad: ${necesidad}`,
      body.rol?`Rol: ${clean(body.rol,200)}`:"",
      body.volumen?`Volumen mensual: ${clean(body.volumen,50)}`:"",
      body.ticket?`Ticket medio: ${clean(body.ticket,50)} €`:"",
      body.plazo?`Plazo: ${clean(body.plazo,100)}`:"",
      `VNX Lead Score interno: ${score}/100`,
      `Clasificación: ${band}`,
      "Consentimiento contacto: sí",
      "Origen: web VentaNexIA",
      body.pipeline_estimado?`Pipeline mensual declarado/estimado: ${clean(body.pipeline_estimado,50)} €`:"",
      body.riesgo_estimado?`Valor mensual declarado en riesgo: ${clean(body.riesgo_estimado,50)} €`:"",
      body.utm_source?`UTM source: ${clean(body.utm_source,150)}`:"",
      body.utm_medium?`UTM medium: ${clean(body.utm_medium,150)}`:"",
      body.utm_campaign?`UTM campaign: ${clean(body.utm_campaign,150)}`:"",
      body.source_url?`Origen URL: ${clean(body.source_url,1000)}`:"",
      body.chat_context?`Conversación IA previa (facilitada al enviar el formulario):\n${clean(body.chat_context,5000)}`:"",
      `Correlation ID: ${correlationId}`,
      `Fecha: ${new Date().toISOString()}`
    ].filter(Boolean).join("\n");

    const props={
      dealname:dealName,
      pipeline:"default",
      dealstage:stageFor(score),
      description:desc,
      hs_priority:score>=85?"high":"medium",
      hs_next_step:nextBestAction
    };

    const deal=await hsFetch("https://api.hubapi.com/crm/v3/objects/deals",{
      method:"POST",headers,
      body:JSON.stringify({
        properties:props,
        associations:[{
          to:{id:contactId},
          types:[{associationCategory:"HUBSPOT_DEFINED",associationTypeId:3}]
        }]
      })
    });

    console.log(JSON.stringify({event:"lead_accepted",correlationId,band,dealCreated:true,ts:new Date().toISOString()}));
    return res.status(200).json({
      ok:true,correlationId,
      contactId,
      dealId:deal.id,
      dealCreated:true,
      qualification:{band,nextBestAction},
      bookingUrl:bookingUrl||null
    });

  }catch(e){
    console.error(JSON.stringify({event:"lead_error",correlationId,error:String(e?.message||e).slice(0,500),ts:new Date().toISOString()}));
    return res.status(500).json({error:"No se pudo registrar la solicitud en CRM",correlationId});
  }
}
