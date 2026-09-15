import {db} from "../../lib/entitlement.js";
import {requestSignals,recordTrialAttempt} from "../../lib/trial-abuse.js";

function clean(value,max=220){return String(value||"").trim().replace(/\s+/g," ").slice(0,max)}
function emailOk(v){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v||"").trim())}
function fold(s=""){return String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"")}
function userNeed({request,sells,clientType,zone}){return [request?clean(request,500):"",sells?`Producto o servicio: ${clean(sells,180)}`:"",clientType?`Cliente ideal: ${clean(clientType,180)}`:"",zone?`Zona: ${clean(zone,180)}`:""].filter(Boolean).join(". ")}
function parseCookies(req){return Object.fromEntries(String(req.headers?.cookie||"").split(";").map(x=>x.trim()).filter(Boolean).map(x=>{const i=x.indexOf("=");return i<0?[x,""]:[x.slice(0,i),decodeURIComponent(x.slice(i+1))]}))}
function internalEmail(email){return /@ventanexia\.es$/i.test(email)}
function goodUrl(url){try{const u=new URL(String(url||""));return /^https?:$/.test(u.protocol)}catch{return false}}
function normalizeLead(raw){const sources=(Array.isArray(raw?.sources)?raw.sources:[]).map(x=>clean(x,500)).filter(goodUrl).slice(0,4);const website=goodUrl(raw?.website)?clean(raw.website,500):"";return{name:clean(raw?.name,160),activity:clean(raw?.activity,220),address:clean(raw?.address,280),phone:clean(raw?.phone,120),email:clean(raw?.email,200),website,fit:clean(raw?.fit,420),evidence:clean(raw?.evidence,420),lat:Number(raw?.lat)||null,long:Number(raw?.long)||null,sources:website&&!sources.includes(website)?[website,...sources].slice(0,4):sources}}
function plausible(lead){if(!lead.name||lead.name.length<2)return false;const n=fold(lead.name);if(["reddit","wikipedia","foro","forum","top 10","mejores "].some(x=>n.includes(x)))return false;return Boolean(lead.sources.length||lead.website||Number.isFinite(lead.lat))}

async function persistentTrialState(req,email,deviceId){
  if(internalEmail(email))return{allowed:true,internal:true};
  try{
    const signals=requestSignals(req,{email,deviceId});
    const [emailRows,deviceRows]=await Promise.all([
      db(`vnx_trial_attempts?email_hash=eq.${signals.emailHash}&reason=eq.PROSPECT_SEARCH_USED&decision=eq.allow&select=id&limit=1`),
      signals.deviceHash?db(`vnx_trial_attempts?device_hash=eq.${signals.deviceHash}&reason=eq.PROSPECT_SEARCH_USED&decision=eq.allow&select=id&limit=1`):[]
    ]);
    if((emailRows||[]).length||(deviceRows||[]).length)return{allowed:false,reason:"TRIAL_ALREADY_USED",signals};
    return{allowed:true,signals,persistent:true};
  }catch(e){
    console.warn("prospect-trial-guard-fallback",String(e?.message||e));
    return{allowed:true,persistent:false};
  }
}
async function consumeTrial(state){if(!state?.signals||state.internal)return;try{await recordTrialAttempt({signals:state.signals,decision:"allow",reason:"PROSPECT_SEARCH_USED"})}catch(e){console.warn("prospect-trial-record-fallback",String(e?.message||e))}}

function categoryFilter(clientType,sells){
  const t=fold(`${clientType} ${sells}`);
  if(/clinic|hospital|centro medic|sanitari|salud/.test(t))return{key:"amenity",regex:"clinic|hospital|doctors"};
  if(/dentist|dental|odont/.test(t))return{key:"amenity",regex:"dentist"};
  if(/farmac/.test(t))return{key:"amenity",regex:"pharmacy"};
  if(/veterin/.test(t))return{key:"amenity",regex:"veterinary"};
  if(/restaurant|bar|cafeter/.test(t))return{key:"amenity",regex:"restaurant|cafe|bar"};
  if(/hotel|hostal|alojamiento/.test(t))return{key:"tourism",regex:"hotel|guest_house|hostel"};
  if(/gimnas|fitness|deportiv/.test(t))return{key:"leisure",regex:"fitness_centre|sports_centre"};
  if(/coleg|escuel|academ|formacion/.test(t))return{key:"amenity",regex:"school|college|language_school|music_school"};
  if(/inmobili|estate/.test(t))return{key:"office",regex:"estate_agent"};
  if(/mueble|cocina|decoracion/.test(t))return{key:"shop",regex:"furniture|kitchen|interior_decoration"};
  if(/coche|automovil|concesionario/.test(t))return{key:"shop",regex:"car"};
  return null;
}

async function fetchJson(url,options={},timeout=18000){const c=new AbortController();const timer=setTimeout(()=>c.abort(),timeout);try{const r=await fetch(url,{...options,signal:c.signal});const data=await r.json().catch(()=>null);if(!r.ok)throw new Error(`HTTP_${r.status}`);return data}finally{clearTimeout(timer)}}
async function geocodeZone(zone){const q=encodeURIComponent(`${zone}, España`);const data=await fetchJson(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=es&q=${q}`,{headers:{"user-agent":"VentaNexIA/1.0 (ventas@ventanexia.es)","accept-language":"es"}},10000);const x=Array.isArray(data)?data[0]:null;if(!x?.boundingbox)return null;return{south:Number(x.boundingbox[0]),north:Number(x.boundingbox[1]),west:Number(x.boundingbox[2]),east:Number(x.boundingbox[3]),lat:Number(x.lat),long:Number(x.lon)}}
function osmAddress(t,zone){const line=[t["addr:street"],t["addr:housenumber"]].filter(Boolean).join(" ");return [line,t["addr:postcode"],t["addr:city"]||t["addr:town"]||zone].filter(Boolean).join(", ")}
function osmActivity(t,clientType){return t.amenity||t.shop||t.office||t.tourism||t.leisure||clientType}
async function callOverpass(input){
  const filter=categoryFilter(input.clientType,input.sells);if(!filter)return null;
  const box=await geocodeZone(input.zone);if(!box)return null;
  const bbox=`${box.south},${box.west},${box.north},${box.east}`;
  const q=`[out:json][timeout:22];(nwr["name"]["${filter.key}"~"^(${filter.regex})$"](${bbox}););out center tags 60;`;
  const data=await fetchJson("https://overpass-api.de/api/interpreter",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded","user-agent":"VentaNexIA/1.0 (ventas@ventanexia.es)"},body:`data=${encodeURIComponent(q)}`},28000);
  const leads=[];const seen=new Set();
  for(const e of data?.elements||[]){const t=e.tags||{};const name=clean(t.name,160);if(!name||seen.has(name.toLowerCase()))continue;seen.add(name.toLowerCase());const website=t.website||t["contact:website"]||"";const phone=t.phone||t["contact:phone"]||"";const email=t.email||t["contact:email"]||"";const lat=e.lat??e.center?.lat;const long=e.lon??e.center?.lon;const osm=`https://www.openstreetmap.org/${e.type}/${e.id}`;leads.push(normalizeLead({name,activity:osmActivity(t,input.clientType),address:osmAddress(t,input.zone),phone,email,website,lat,long,fit:`Su actividad pública encaja con ${input.clientType} en ${input.zone}; por ese perfil puede ser un posible comprador de ${input.sells}.`,evidence:"Negocio existente localizado en OpenStreetMap.",sources:[website,osm].filter(Boolean)}));if(leads.length>=5)break}
  const final=leads.filter(plausible);if(!final.length)return null;return{interpreted:{sells:input.sells,clientType:input.clientType,zone:input.zone,summary:userNeed(input)},leads:final,provider:"openstreetmap-overpass"}
}

async function callNominatim(input){
  const generic=/^(tiendas?|comercios?|empresas?|negocios?|distribuidores?|mayoristas?|pymes?)$/i.test(clean(input.clientType));
  const q=generic&&input.sells?`${input.sells} ${input.zone}, España`:`${input.clientType} ${input.zone}, España`;
  const data=await fetchJson(`https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&extratags=1&namedetails=1&limit=15&countrycodes=es&q=${encodeURIComponent(q)}`,{headers:{"user-agent":"VentaNexIA/1.0 (ventas@ventanexia.es)","accept-language":"es"}},12000);
  const leads=(Array.isArray(data)?data:[]).map(x=>{const t=x.extratags||{};const name=x.namedetails?.name||String(x.display_name||"").split(",")[0];const website=t.website||t["contact:website"]||"";const osm=x.osm_type&&x.osm_id?`https://www.openstreetmap.org/${x.osm_type}/${x.osm_id}`:"";return normalizeLead({name,activity:input.clientType,address:x.display_name||"",phone:t.phone||t["contact:phone"]||"",email:t.email||t["contact:email"]||"",website,lat:Number(x.lat),long:Number(x.lon),fit:`Negocio localizado en ${input.zone} que coincide con el perfil buscado y podría necesitar ${input.sells}.`,evidence:"Registro público de OpenStreetMap.",sources:[website,osm].filter(Boolean)})}).filter(plausible).slice(0,5);
  if(!leads.length)return null;return{interpreted:{sells:input.sells,clientType:input.clientType,zone:input.zone,summary:userNeed(input)},leads,provider:"openstreetmap-search"}
}

async function callGooglePlaces(input){const key=String(process.env.GOOGLE_PLACES_API_KEY||"").trim();if(!key)return null;const generic=/^(tiendas?|comercios?|empresas?|negocios?|distribuidores?|mayoristas?|pymes?)$/i.test(clean(input.clientType));const textQuery=generic&&input.sells?`${input.clientType} ${input.sells} en ${input.zone}, España`:`${input.clientType} en ${input.zone}, España`;const data=await fetchJson("https://places.googleapis.com/v1/places:searchText",{method:"POST",headers:{"Content-Type":"application/json","X-Goog-Api-Key":key,"X-Goog-FieldMask":"places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.googleMapsUri,places.location,places.primaryTypeDisplayName"},body:JSON.stringify({textQuery,languageCode:"es",regionCode:"ES",pageSize:8})},16000);const leads=(data?.places||[]).map(p=>normalizeLead({name:p.displayName?.text,activity:p.primaryTypeDisplayName?.text||input.clientType,address:p.formattedAddress,phone:p.nationalPhoneNumber,website:p.websiteUri,lat:p.location?.latitude,long:p.location?.longitude,fit:`Por su actividad en ${input.zone}, puede ser un posible comprador de ${input.sells}.`,evidence:"Resultado localizado mediante Google Places.",sources:[p.websiteUri,p.googleMapsUri].filter(Boolean)})).filter(plausible).slice(0,5);if(!leads.length)return null;return{interpreted:{sells:input.sells,clientType:input.clientType,zone:input.zone,summary:userNeed(input)},leads,provider:"google-places"}}

async function findProspects(input){const errors=[];for(const [name,fn] of [["overpass",callOverpass],["google",callGooglePlaces],["nominatim",callNominatim]]){try{const r=await fn(input);if(r?.leads?.length)return{...r,diagnostics:errors}}catch(e){const m=`${name}:${String(e?.message||e)}`;errors.push(m);console.error("prospect-search-provider",m)}}throw new Error(errors.join(" | ")||"NO_RESULTS")}

export default async function handler(req,res){
  if(req.method!=="POST")return res.status(405).json({error:"Método no permitido"});
  const email=clean(req.body?.email,240).toLowerCase();const company=clean(req.body?.company,180);const deviceId=clean(req.body?.deviceId,160);const consent=req.body?.consent===true;
  const request=clean(req.body?.request,900),sells=clean(req.body?.sells,180),clientType=clean(req.body?.clientType,180),zone=clean(req.body?.zone,180);
  if(!emailOk(email)||!company||!consent)return res.status(400).json({error:"Para hacer la prueba indica empresa, un email válido y acepta el uso de tus datos para esta demostración."});
  if(!(sells&&clientType&&zone))return res.status(400).json({error:"Indica qué vendes, qué tipo de cliente buscas y la zona."});
  const cookies=parseCookies(req);if(!internalEmail(email)&&cookies.vnx_prospect_demo==="used")return res.status(429).json({error:"Esta prueba gratuita ya se ha utilizado en este navegador. Para seguir buscando clientes, solicita una demo o activa VentaNexIA.",code:"TRIAL_ALREADY_USED"});
  const trial=await persistentTrialState(req,email,deviceId);if(!trial.allowed)return res.status(429).json({error:"Este email o dispositivo ya ha utilizado la búsqueda gratuita. Para seguir buscando clientes, solicita una demo o activa VentaNexIA.",code:"TRIAL_ALREADY_USED"});
  try{
    const result=await findProspects({request,sells,clientType,zone});
    if(!internalEmail(email)){await consumeTrial(trial);res.setHeader("Set-Cookie","vnx_prospect_demo=used; Max-Age=15552000; Path=/; HttpOnly; Secure; SameSite=Lax")}
    return res.status(200).json({query:result.interpreted,leads:result.leads,sourceMode:result.provider,trialConsumed:!internalEmail(email),verificationMessage:"Empresas localizadas en fuentes públicas. Si un dato de contacto no está publicado, no lo inventamos."});
  }catch(error){console.error("prospect-search",error);return res.status(502).json({error:"No hemos podido obtener resultados fiables de las fuentes públicas en este momento. La prueba no se ha consumido; puedes volver a intentarlo.",code:"PROSPECT_SEARCH_UNAVAILABLE"})}
}
