function clean(value, max = 220) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, max);
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

const BLOCKED_HOSTS = [
  "reddit.com", "wikipedia.org", "facebook.com", "instagram.com", "linkedin.com",
  "youtube.com", "x.com", "twitter.com", "pinterest.", "tiktok.com", "bing.com"
];

function isGoogleMapsUrl(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    return (host.includes("google.") || host === "maps.app.goo.gl") && (u.pathname.includes("/maps") || host === "maps.app.goo.gl");
  } catch {
    return false;
  }
}

function isBlockedUrl(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes("google.") && !isGoogleMapsUrl(url)) return true;
    return BLOCKED_HOSTS.some(x => host.includes(x));
  } catch {
    return true;
  }
}

function isBusinessWebsite(url) {
  return /^https?:\/\//i.test(String(url || "")) && !isBlockedUrl(url) && !isGoogleMapsUrl(url);
}

function isEvidenceUrl(url) {
  return /^https?:\/\//i.test(String(url || "")) && (!isBlockedUrl(url) || isGoogleMapsUrl(url));
}

function normalizeLead(item) {
  const sources = Array.isArray(item?.sources)
    ? item.sources.map(x => clean(x, 500)).filter(isEvidenceUrl).slice(0, 5)
    : [];

  const website = clean(item?.website, 380);
  return {
    name: clean(item?.name, 160),
    activity: clean(item?.activity, 220),
    address: clean(item?.address, 280),
    phone: clean(item?.phone, 120),
    email: clean(item?.email, 200),
    website: isBusinessWebsite(website) ? website : "",
    fit: clean(item?.fit, 420),
    sources
  };
}

function responseText(data) {
  if (typeof data?.output_text === "string") return data.output_text;
  const parts = [];
  for (const item of data?.output || []) {
    if (item?.type !== "message") continue;
    for (const c of item?.content || []) {
      if (typeof c?.text === "string") parts.push(c.text);
      if (typeof c?.output_text === "string") parts.push(c.output_text);
    }
  }
  return parts.join("\n");
}

function userNeed({ request, sells, clientType, zone }) {
  const structured = [
    sells ? `Vendo/ofrezco: ${sells}` : "",
    clientType ? `Busco como clientes: ${clientType}` : "",
    zone ? `Zona: ${zone}, España` : ""
  ].filter(Boolean).join(". ");
  if (request && structured) return `${request}. Datos concretos aportados: ${structured}.`;
  return request || structured;
}

function looksLikeRealBusinessName(name) {
  const n = String(name || "").toLowerCase();
  if (!n || n.length < 2) return false;
  const bad = ["reddit", "wiki", "wikipedia", "forum", "foro", "thread", "r/", "quora", "claustrophobic"];
  return !bad.some(x => n.includes(x));
}

function verifyAiLeads(items) {
  const out = [];
  for (const raw of items || []) {
    const lead = normalizeLead(raw);
    if (!looksLikeRealBusinessName(lead.name)) continue;
    if (!lead.website && !lead.sources.length) continue;
    out.push(lead);
    if (out.length >= 3) break;
  }
  return out;
}

async function callOpenAI(input) {
  const key = String(process.env.OPENAI_API_KEY || "").trim();
  if (!key) return null;
  const need = userNeed(input);
  const prompt = `Eres el motor de prospección comercial de VentaNexIA.

OBJETIVO: encontrar empresas REALES que encajen exactamente con lo que pide el usuario y que puedan ser clientes potenciales.

REGLAS OBLIGATORIAS:
- Interpreta la intención completa, no palabras sueltas.
- Si el usuario indica un TIPO DE CLIENTE, respétalo como criterio principal. Ejemplo: si vende portasueros y pide clínicas en Madrid, devuelve clínicas reales de Madrid; NO busques empresas que vendan portasueros.
- Si el tipo de cliente es genérico (por ejemplo "tiendas") usa lo que vende para concretar el sector. Ejemplo: "tiendas" + "muebles de cocina" = tiendas/estudios de muebles de cocina.
- Devuelve SOLO empresas o negocios reales. Nunca artículos, foros, Reddit, Wikipedia, directorios genéricos, páginas informativas o resultados editoriales.
- Cada resultado debe tener una web oficial o una fuente pública verificable.
- No inventes nombre, dirección, teléfono, email ni web. Si un dato no aparece públicamente, déjalo vacío.
- La zona debe corresponder a la petición.
- No devuelvas competidores o vendedores del producto salvo que precisamente sean el tipo de cliente solicitado.
- Es preferible devolver menos de 3 empresas correctas antes que completar con resultados dudosos.
- En fit explica de forma concreta por qué ese negocio pertenece al tipo de cliente solicitado y podría usar/comprar lo que vende el usuario.

Devuelve SOLO JSON válido con:
interpreted{sells,clientType,zone,summary}
leads[{name,activity,address,phone,email,website,fit,sources}]

PETICIÓN DEL USUARIO: ${need}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: controller.signal,
      headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-5.6-luna",
        tools: [{ type: "web_search" }],
        input: prompt,
        max_output_tokens: 3000
      })
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`OPENAI_${r.status}:${clean(data?.error?.message || "", 180)}`);
    const parsed = extractJson(responseText(data));
    const leads = verifyAiLeads(Array.isArray(parsed?.leads) ? parsed.leads : []);
    if (!leads.length) throw new Error("OPENAI_NO_VERIFIED_BUSINESSES");
    return {
      interpreted: {
        sells: clean(parsed?.interpreted?.sells || input.sells, 180),
        clientType: clean(parsed?.interpreted?.clientType || input.clientType, 180),
        zone: clean(parsed?.interpreted?.zone || input.zone, 180),
        summary: clean(parsed?.interpreted?.summary || need, 420)
      },
      leads,
      provider: "openai-web-search"
    };
  } finally {
    clearTimeout(timer);
  }
}

function googleBuyerQuery(input) {
  const type = clean(input.clientType, 180);
  const zone = clean(input.zone, 180);
  const sells = clean(input.sells, 180);
  if (!type || !zone) return "";

  const genericType = /^(tiendas?|comercios?|distribuidores?|mayoristas?|minoristas?|proveedores?|empresas?)$/i.test(type);
  if (genericType && sells) return `${type} ${sells} en ${zone}, España`;
  return `${type} en ${zone}, España`;
}

async function callGooglePlaces(input) {
  const key = String(process.env.GOOGLE_PLACES_API_KEY || "").trim();
  if (!key || !input.clientType || !input.zone) return null;

  const query = googleBuyerQuery(input);
  if (!query) return null;

  const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.googleMapsUri,places.types"
    },
    body: JSON.stringify({ textQuery: query, languageCode: "es", regionCode: "ES", pageSize: 10 })
  });
  if (!r.ok) throw new Error(`GOOGLE_PLACES_${r.status}`);
  const data = await r.json();

  const leads = (data?.places || []).map(p => normalizeLead({
    name: p?.displayName?.text || "",
    activity: input.clientType,
    address: p?.formattedAddress || "",
    phone: p?.nationalPhoneNumber || "",
    email: "",
    website: p?.websiteUri || "",
    fit: input.sells
      ? `${p?.displayName?.text || "Este negocio"} figura como ${input.clientType} en ${input.zone}; por ese tipo de actividad puede ser un comprador potencial de ${input.sells}.`
      : `${p?.displayName?.text || "Este negocio"} figura como ${input.clientType} en ${input.zone}.`,
    sources: [p?.websiteUri, p?.googleMapsUri].filter(Boolean)
  })).filter(x => looksLikeRealBusinessName(x.name) && x.address && x.sources.length).slice(0, 3);

  if (!leads.length) return null;

  return {
    interpreted: {
      sells: clean(input.sells),
      clientType: clean(input.clientType),
      zone: clean(input.zone),
      summary: clean(userNeed(input), 420)
    },
    leads,
    provider: "google-places"
  };
}

async function callSonar(input) {
  const key = String(process.env.AI_GATEWAY_API_KEY || "").trim();
  if (!key) return null;
  const need = userNeed(input);
  const r = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "perplexity/sonar-pro",
      messages: [{
        role: "user",
        content: `Busca empresas REALES que encajen exactamente con esta petición comercial: ${need}. Si se indica un tipo de cliente, respétalo como criterio principal. Por ejemplo, portasueros + clínicas + Madrid significa buscar clínicas reales de Madrid, no vendedores de portasueros. Si el tipo es genérico como tiendas, usa el producto para concretar el sector. Prohibido devolver Reddit, Wikipedia, foros, artículos o directorios genéricos. Cada empresa debe tener una web oficial o fuente pública verificable. No inventes datos; deja vacío lo que no encuentres. Devuelve SOLO JSON con interpreted{sells,clientType,zone,summary} y leads[{name,activity,address,phone,email,website,fit,sources}].`
      }],
      temperature: 0,
      max_tokens: 2800
    })
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`SONAR_${r.status}`);
  const parsed = extractJson(data?.choices?.[0]?.message?.content || "");
  const leads = verifyAiLeads(Array.isArray(parsed?.leads) ? parsed.leads : []);
  if (!leads.length) throw new Error("SONAR_NO_VERIFIED_BUSINESSES");
  return {
    interpreted: {
      sells: clean(parsed?.interpreted?.sells || input.sells, 180),
      clientType: clean(parsed?.interpreted?.clientType || input.clientType, 180),
      zone: clean(parsed?.interpreted?.zone || input.zone, 180),
      summary: clean(parsed?.interpreted?.summary || need, 420)
    },
    leads,
    provider: "sonar-web-search"
  };
}

async function findProspects(input) {
  const errors = [];
  const providers = input.clientType && input.zone
    ? [["google", callGooglePlaces], ["openai", callOpenAI], ["sonar", callSonar]]
    : [["openai", callOpenAI], ["sonar", callSonar]];

  for (const [name, fn] of providers) {
    try {
      const result = await fn(input);
      if (result?.leads?.length) return result;
    } catch (e) {
      errors.push(`${name}:${String(e?.message || e)}`);
      console.error("prospect-search-provider", name, e);
    }
  }
  throw new Error(errors.join(" | ") || "NO_VERIFIED_SEARCH_RESULTS");
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });

  const request = clean(req.body?.request, 900);
  const sells = clean(req.body?.sells, 180);
  const clientType = clean(req.body?.clientType, 180);
  const zone = clean(req.body?.zone, 180);

  if (!request && !(sells && clientType && zone)) {
    return res.status(400).json({ error: "Escribe qué quieres encontrar o completa qué vendes, tipo de cliente y zona." });
  }

  try {
    const result = await findProspects({ request, sells, clientType, zone });
    return res.status(200).json({
      query: result.interpreted,
      leads: result.leads,
      verified: true,
      sourceMode: result.provider,
      verificationMessage: "Resultados obtenidos de fuentes públicas. No inventamos datos de contacto: si no están publicados, se dejan vacíos."
    });
  } catch (error) {
    console.error("prospect-search", error);
    return res.status(502).json({
      error: "No hemos podido localizar ahora mismo negocios reales que coincidan con la búsqueda. Prueba de nuevo o concreta el tipo de cliente y la zona."
    });
  }
}
