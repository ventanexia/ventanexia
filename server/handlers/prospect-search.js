function clean(value, max = 180) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, max);
}

function stripHtml(s = "") {
  return String(s)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function extractJson(text) {
  const raw = String(text || "").trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : raw;
  const first = candidate.indexOf("{");
  const last = candidate.lastIndexOf("}");
  if (first < 0 || last <= first) throw new Error("JSON_NOT_FOUND");
  return JSON.parse(candidate.slice(first, last + 1));
}

function normalizeLead(item, sells, clientType, zone) {
  const website = clean(item?.website, 320);
  const sources = Array.isArray(item?.sources)
    ? item.sources.map(x => clean(x, 400)).filter(x => /^https?:\/\//i.test(x)).slice(0, 4)
    : [];
  return {
    name: clean(item?.name, 140),
    activity: clean(item?.activity || clientType, 180),
    address: clean(item?.address, 240),
    phone: clean(item?.phone, 100),
    email: clean(item?.email, 180),
    website,
    fit: clean(item?.fit || `Por su actividad en ${zone}, puede ser un posible comprador de ${sells}.`, 320),
    sources: sources.length ? sources : (website ? [website] : [])
  };
}

async function fetchText(url, timeout = 6500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const r = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; VentaNexIA/1.0; +https://www.ventanexia.es)",
        "accept-language": "es-ES,es;q=0.9,en;q=0.5"
      }
    });
    if (!r.ok) throw new Error(`HTTP_${r.status}`);
    const type = String(r.headers.get("content-type") || "");
    if (!type.includes("text/html") && !type.includes("text/plain")) throw new Error("NOT_TEXT");
    return await r.text();
  } finally {
    clearTimeout(timer);
  }
}

function firstEmail(text) {
  const matches = String(text).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig) || [];
  for (const raw of matches) {
    const v = raw.replace(/[),.;:]+$/, "");
    if (!/example|sentry|wixpress|cloudflare|domain|noreply|no-reply/i.test(v)) return v;
  }
  return "";
}

async function enrichEmail(website) {
  if (!website) return "";
  let origin;
  try { origin = new URL(website).origin; } catch { return ""; }
  for (const url of [website, `${origin}/contacto`, `${origin}/contact`, `${origin}/es/contacto`, `${origin}/contacta`]) {
    try {
      const html = await fetchText(url, 4500);
      const email = firstEmail(stripHtml(html).slice(0, 70000));
      if (email) return email;
    } catch {}
  }
  return "";
}

async function searchWithGatewaySonar({ sells, clientType, zone }) {
  const key = String(process.env.AI_GATEWAY_API_KEY || "").trim();
  if (!key) return [];

  const prompt = `Busca clientes potenciales REALES en España.

DATOS
- Producto/servicio que vende el visitante: ${sells}
- Tipo de comprador que quiere encontrar: ${clientType}
- Población/zona: ${zone}, España

METODO
- Busca primero negocios REALES del tipo ${clientType} en ${zone}.
- NO busques vendedores de ${sells}; buscamos COMPRADORES potenciales.
- Verifica cada empresa en web oficial, directorio público fiable o perfil empresarial público.
- Devuelve exactamente 3 empresas cuando existan.
- Solo datos empresariales públicos. No inventes email, teléfono, web ni dirección.
- Si un dato no aparece, usa cadena vacía.
- En fit explica por qué ese negocio podría comprar ${sells}.
- Devuelve SOLO JSON válido.

FORMATO
{"leads":[{"name":"","activity":"","address":"","phone":"","email":"","website":"","fit":"","sources":["https://..."]}]}`;

  const r = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "perplexity/sonar-pro",
      messages: [
        { role: "system", content: "Eres un investigador comercial B2B. Encuentra compradores potenciales reales, no competidores ni vendedores del mismo producto." },
        { role: "user", content: prompt }
      ],
      temperature: 0.1,
      max_tokens: 2500
    })
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`AI_GATEWAY_${r.status}:${clean(data?.error?.message || data?.error || "", 180)}`);
  const content = data?.choices?.[0]?.message?.content;
  const text = typeof content === "string" ? content : Array.isArray(content) ? content.map(x => x?.text || "").join("\n") : "";
  const parsed = extractJson(text);
  const leads = Array.isArray(parsed?.leads)
    ? parsed.leads.map(x => normalizeLead(x, sells, clientType, zone)).filter(x => x.name).slice(0, 3)
    : [];
  for (const lead of leads) {
    if (!lead.email && lead.website) {
      try { lead.email = await enrichEmail(lead.website); } catch {}
    }
  }
  return leads;
}

async function searchGooglePlaces({ sells, clientType, zone }) {
  const key = String(process.env.GOOGLE_PLACES_API_KEY || "").trim();
  if (!key) return [];
  const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.businessStatus,places.googleMapsUri"
    },
    body: JSON.stringify({ textQuery: `${clientType} en ${zone}, España`, languageCode: "es", regionCode: "ES", pageSize: 10 })
  });
  if (!r.ok) throw new Error(`GOOGLE_PLACES_${r.status}`);
  const data = await r.json();
  const places = Array.isArray(data?.places) ? data.places : [];
  const leads = [];
  for (const p of places) {
    if (p?.businessStatus && p.businessStatus !== "OPERATIONAL") continue;
    const website = clean(p?.websiteUri, 320);
    leads.push({
      name: clean(p?.displayName?.text, 140),
      activity: clean(clientType, 180),
      address: clean(p?.formattedAddress, 240),
      phone: clean(p?.nationalPhoneNumber, 100),
      email: website ? await enrichEmail(website) : "",
      website,
      fit: `Por su actividad en ${zone}, puede ser un posible comprador de ${sells}.`,
      sources: [website || clean(p?.googleMapsUri, 400)].filter(Boolean)
    });
    if (leads.length >= 3) break;
  }
  return leads.filter(x => x.name);
}

function osmFilters(clientType) {
  const t = clean(clientType, 120).toLowerCase();
  const rules = [
    [/farmac/, ['["amenity"="pharmacy"]']],
    [/cl[ií]nic|centro m[eé]dico/, ['["amenity"="clinic"]','["healthcare"="clinic"]']],
    [/hospital/, ['["amenity"="hospital"]']],
    [/dentist|cl[ií]nica dental/, ['["amenity"="dentist"]']],
    [/m[eé]dic|doctor/, ['["amenity"="doctors"]']],
    [/veterin/, ['["amenity"="veterinary"]']],
    [/hotel|alojamiento/, ['["tourism"="hotel"]','["tourism"="hostel"]']],
    [/restaurante?/, ['["amenity"="restaurant"]']],
    [/bar|pub/, ['["amenity"="bar"]','["amenity"="pub"]']],
    [/caf[eé]/, ['["amenity"="cafe"]']],
    [/supermerc/, ['["shop"="supermarket"]']],
    [/tienda.*mueble|mueble/, ['["shop"="furniture"]']],
    [/juguet|tienda.*juguete/, ['["shop"="toys"]']],
    [/herbol|diet[eé]tic|salud natural/, ['["shop"="health_food"]','["shop"="herbalist"]']],
    [/cosm[eé]tic|perfumer/, ['["shop"="cosmetics"]','["shop"="perfumery"]']],
    [/est[eé]tica|belleza/, ['["shop"="beauty"]']],
    [/peluquer/, ['["shop"="hairdresser"]']],
    [/optica|[óo]ptica/, ['["shop"="optician"]']],
    [/ropa|moda|textil/, ['["shop"="clothes"]']],
    [/zapater/, ['["shop"="shoes"]']],
    [/deporte/, ['["shop"="sports"]']],
    [/electr[oó]nic|inform[aá]tic/, ['["shop"="electronics"]','["shop"="computer"]']],
    [/ferreter/, ['["shop"="hardware"]']],
    [/jard[ií]n|vivero/, ['["shop"="garden_centre"]']],
    [/mascota/, ['["shop"="pet"]']],
    [/panader|pasteler/, ['["shop"="bakery"]']],
    [/carnicer/, ['["shop"="butcher"]']],
    [/librer/, ['["shop"="books"]']],
    [/gimnas|fitness/, ['["leisure"="fitness_centre"]']],
    [/colegio|escuela/, ['["amenity"="school"]']],
    [/universidad/, ['["amenity"="university"]']],
    [/guarder|escuela infantil/, ['["amenity"="kindergarten"]']],
    [/inmobiliari/, ['["office"="estate_agent"]']],
    [/viajes|agencia.*viaje/, ['["shop"="travel_agency"]']],
    [/abogad/, ['["office"="lawyer"]']],
    [/asesor|gestor|contab/, ['["office"="accountant"]']]
  ];
  for (const [re, filters] of rules) if (re.test(t)) return filters;
  return [];
}

async function geocodeZone(zone) {
  const q = encodeURIComponent(`${zone}, España`);
  const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=es&q=${q}`, {
    headers: { "user-agent": "VentaNexIA/1.0 (+https://www.ventanexia.es)" }
  });
  if (!r.ok) throw new Error(`NOMINATIM_${r.status}`);
  const data = await r.json();
  const x = Array.isArray(data) ? data[0] : null;
  if (!x) return null;
  return { lat: Number(x.lat), lon: Number(x.lon), display: clean(x.display_name, 240) };
}

function osmWebsite(tags = {}) {
  return clean(tags.website || tags["contact:website"] || tags.url || "", 320);
}
function osmPhone(tags = {}) {
  return clean(tags.phone || tags["contact:phone"] || tags.mobile || "", 100);
}
function osmEmail(tags = {}) {
  return clean(tags.email || tags["contact:email"] || "", 180);
}
function osmAddress(tags = {}, fallback = "") {
  const parts = [tags["addr:street"], tags["addr:housenumber"], tags["addr:postcode"], tags["addr:city"]].filter(Boolean);
  return clean(parts.join(" ") || fallback, 240);
}

async function searchOpenStreetMap({ sells, clientType, zone }) {
  const filters = osmFilters(clientType);
  if (!filters.length) return [];
  const geo = await geocodeZone(zone);
  if (!geo || !Number.isFinite(geo.lat) || !Number.isFinite(geo.lon)) return [];
  const radius = 18000;
  const blocks = filters.map(f => `nwr${f}(around:${radius},${geo.lat},${geo.lon});`).join("\n");
  const query = `[out:json][timeout:18];(${blocks});out center tags 30;`;
  const r = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: new URLSearchParams({ data: query }).toString()
  });
  if (!r.ok) throw new Error(`OVERPASS_${r.status}`);
  const data = await r.json();
  const rows = Array.isArray(data?.elements) ? data.elements : [];
  const leads = [];
  const seen = new Set();
  for (const el of rows) {
    const tags = el?.tags || {};
    const name = clean(tags.name || tags.brand || tags.operator, 140);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const website = osmWebsite(tags);
    let email = osmEmail(tags);
    if (!email && website) {
      try { email = await enrichEmail(website); } catch {}
    }
    const lat = Number(el.lat ?? el.center?.lat);
    const lon = Number(el.lon ?? el.center?.lon);
    const osmUrl = Number.isFinite(lat) && Number.isFinite(lon) ? `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}` : "https://www.openstreetmap.org";
    leads.push({
      name,
      activity: clean(clientType, 180),
      address: osmAddress(tags, zone),
      phone: osmPhone(tags),
      email,
      website,
      fit: `Es un negocio del tipo ${clean(clientType, 100)} localizado en la zona de ${clean(zone, 80)} y puede ser un comprador potencial de ${clean(sells, 120)}.`,
      sources: [website || osmUrl].filter(Boolean)
    });
    if (leads.length >= 8) break;
  }
  return leads.slice(0, 3);
}

async function findProspects(input) {
  const providers = [
    ["google-places", searchGooglePlaces],
    ["ai-gateway-sonar", searchWithGatewaySonar],
    ["openstreetmap", searchOpenStreetMap]
  ];
  const errors = [];
  for (const [name, fn] of providers) {
    try {
      const leads = await fn(input);
      if (leads.length) return { leads: leads.slice(0, 3), provider: name };
    } catch (e) {
      errors.push(`${name}:${String(e?.message || e)}`);
      console.error("prospect-provider", name, e);
    }
  }
  throw new Error(errors.join(" | ") || "NO_RESULTS");
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });
  const sells = clean(req.body?.sells);
  const clientType = clean(req.body?.clientType);
  const zone = clean(req.body?.zone);
  if (!sells || !clientType || !zone) return res.status(400).json({ error: "Completa qué vendes, tipo de cliente y zona." });

  try {
    const result = await findProspects({ sells, clientType, zone });
    return res.status(200).json({
      query: { sells, clientType, zone },
      leads: result.leads,
      verified: true,
      sourceMode: result.provider
    });
  } catch (error) {
    console.error("prospect-search", error);
    return res.status(502).json({ error: "No hemos podido localizar negocios verificables con esa búsqueda. Prueba describiendo el comprador de forma sencilla, por ejemplo: farmacias, clínicas, hoteles, herbolarios, tiendas de muebles o jugueterías." });
  }
}
