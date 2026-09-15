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
  "youtube.com", "x.com", "twitter.com", "pinterest.", "tiktok.com", "bing.com", "google."
];

function isBlockedUrl(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return BLOCKED_HOSTS.some(x => host.includes(x));
  } catch {
    return true;
  }
}

function normalizeLead(item) {
  const sources = Array.isArray(item?.sources)
    ? item.sources.map(x => clean(x, 500)).filter(x => /^https?:\/\//i.test(x) && !isBlockedUrl(x)).slice(0, 5)
    : [];

  const website = clean(item?.website, 380);
  return {
    name: clean(item?.name, 160),
    activity: clean(item?.activity, 220),
    address: clean(item?.address, 280),
    phone: clean(item?.phone, 120),
    email: clean(item?.email, 200),
    website: website && !isBlockedUrl(website) ? website : "",
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

async function fetchOk(url, timeout = 7000) {
  if (!url || isBlockedUrl(url)) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const r = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; VentaNexIA/1.0; +https://www.ventanexia.es)",
        "accept-language": "es-ES,es;q=0.9"
      }
    });
    return r.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function looksLikeRealBusinessName(name) {
  const n = String(name || "").toLowerCase();
  if (!n || n.length < 2) return false;
  const bad = ["reddit", "wiki", "wikipedia", "forum", "foro", "thread", "r/", "quora", "claustrophobic"];
  return !bad.some(x => n.includes(x));
}

async function verifyLeads(items) {
  const out = [];
  for (const raw of items || []) {
    const lead = normalizeLead(raw);
    if (!looksLikeRealBusinessName(lead.name)) continue;

    const urls = [lead.website, ...lead.sources].filter(Boolean);
    if (!urls.length) continue;

    let verifiedUrl = "";
    for (const url of urls.slice(0, 3)) {
      if (await fetchOk(url)) {
        verifiedUrl = url;
        break;
      }
    }
    if (!verifiedUrl) continue;

    if (!lead.website) lead.website = verifiedUrl;
    if (!lead.sources.length) lead.sources = [verifiedUrl];
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
- Interpreta la intención completa, no palabras sueltas. Ejemplo: si vende muebles de cocina y busca tiendas, debes buscar tiendas reales de muebles de cocina, estudios de cocina o distribuidores adecuados; NO cualquier "tienda".
- Devuelve SOLO empresas o negocios reales. Nunca artículos, foros, Reddit, Wikipedia, directorios genéricos, páginas informativas o resultados editoriales.
- Cada resultado debe tener una web oficial o una fuente pública verificable de la propia empresa.
- No inventes nombre, dirección, teléfono, email ni web. Si un dato no aparece públicamente, déjalo como cadena vacía.
- La zona debe corresponder a la petición. No escribas una ciudad como dirección si no has encontrado una dirección real.
- No devuelvas competidores o vendedores del mismo producto salvo que precisamente sean el tipo de cliente solicitado.
- Es preferible devolver 1 o 2 empresas correctas antes que completar 3 con resultados dudosos.
- En fit explica en una frase concreta por qué esa empresa encaja con la búsqueda.

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
    const leads = await verifyLeads(Array.isArray(parsed?.leads) ? parsed.leads : []);
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

async function callGooglePlaces(input) {
  const key = String(process.env.GOOGLE_PLACES_API_KEY || "").trim();
  if (!key || !input.zone) return null;

  const target = clean(input.clientType || input.request, 300);
  if (!target) return null;

  const query = input.sells && input.clientType
    ? `${input.clientType} de ${input.sells} en ${input.zone}, España`
    : `${target} en ${input.zone}, España`;

  const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.googleMapsUri,places.types"
    },
    body: JSON.stringify({ textQuery: query, languageCode: "es", regionCode: "ES", pageSize: 8 })
  });
  if (!r.ok) throw new Error(`GOOGLE_PLACES_${r.status}`);
  const data = await r.json();

  const raw = (data?.places || []).map(p => ({
    name: p?.displayName?.text,
    activity: input.clientType || target,
    address: p?.formattedAddress || "",
    phone: p?.nationalPhoneNumber || "",
    email: "",
    website: p?.websiteUri || "",
    fit: `Negocio localizado en ${input.zone} mediante Google Places y relacionado con la búsqueda solicitada.`,
    sources: [p?.websiteUri, p?.googleMapsUri].filter(Boolean)
  }));

  const leads = raw.map(normalizeLead).filter(x => x.name && (x.website || x.sources.length)).slice(0, 3);
  if (!leads.length) return null;

  return {
    interpreted: {
      sells: clean(input.sells),
      clientType: clean(input.clientType || target),
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
        content: `Busca empresas REALES que encajen exactamente con esta petición comercial: ${need}. Interpreta la necesidad completa. Si vende muebles de cocina y busca tiendas, busca tiendas/estudios reales de muebles de cocina, no resultados que contengan simplemente la palabra tienda. Prohibido devolver Reddit, Wikipedia, foros, artículos, directorios genéricos o páginas editoriales. Cada empresa debe tener web oficial o fuente pública verificable. No inventes datos y deja vacío lo que no encuentres. Es mejor devolver menos de 3 que incluir un resultado dudoso. Devuelve SOLO JSON con interpreted{sells,clientType,zone,summary} y leads[{name,activity,address,phone,email,website,fit,sources}].`
      }],
      temperature: 0,
      max_tokens: 2800
    })
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`SONAR_${r.status}`);
  const parsed = extractJson(data?.choices?.[0]?.message?.content || "");
  const leads = await verifyLeads(Array.isArray(parsed?.leads) ? parsed.leads : []);
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
  for (const [name, fn] of [
    ["openai", callOpenAI],
    ["google", callGooglePlaces],
    ["sonar", callSonar]
  ]) {
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
      verificationMessage: "Solo mostramos empresas con una fuente pública comprobable. Si un dato no está publicado, no lo inventamos."
    });
  } catch (error) {
    console.error("prospect-search", error);
    return res.status(502).json({
      error: "No hemos encontrado empresas que podamos comprobar con suficiente seguridad. Prueba a concretar el tipo de cliente y la zona."
    });
  }
}
