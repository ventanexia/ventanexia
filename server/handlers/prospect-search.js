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

const BLOCKED = [
  "reddit.com", "wikipedia.org", "facebook.com", "instagram.com", "linkedin.com",
  "youtube.com", "x.com", "twitter.com", "pinterest.", "tiktok.com",
  "bing.com", "tripadvisor.", "yelp.", "quora.com"
];

function goodUrl(url) {
  try {
    const u = new URL(String(url || ""));
    const h = u.hostname.toLowerCase();
    return /^https?:$/.test(u.protocol) && !BLOCKED.some(x => h.includes(x));
  } catch {
    return false;
  }
}

function normalizeLead(raw) {
  const sources = Array.isArray(raw?.sources)
    ? raw.sources.map(x => clean(x, 500)).filter(goodUrl).slice(0, 4)
    : [];
  const website = clean(raw?.website, 500);
  const safeWebsite = goodUrl(website) ? website : (sources[0] || "");
  return {
    name: clean(raw?.name, 160),
    activity: clean(raw?.activity, 220),
    address: clean(raw?.address, 280),
    phone: clean(raw?.phone, 120),
    email: clean(raw?.email, 200),
    website: safeWebsite,
    fit: clean(raw?.fit, 420),
    evidence: clean(raw?.evidence, 420),
    sources: safeWebsite && !sources.includes(safeWebsite) ? [safeWebsite, ...sources].slice(0, 4) : sources
  };
}

function plausibleBusiness(lead) {
  if (!lead.name || lead.name.length < 2) return false;
  if (!lead.website && !lead.sources.length) return false;
  const n = lead.name.toLowerCase();
  return !["reddit", "wikipedia", "foro", "forum", "top 10", "mejores ", "guía ", "guia "].some(x => n.includes(x));
}

function userNeed({ request, sells, clientType, zone }) {
  const structured = [
    sells ? `Producto o servicio: ${sells}` : "",
    clientType ? `Cliente ideal: ${clientType}` : "",
    zone ? `Zona: ${zone}` : ""
  ].filter(Boolean).join(". ");
  return request && structured ? `${request}. ${structured}.` : (request || structured);
}

function researchPrompt(input) {
  const need = userNeed(input);
  return `Actúas como investigador comercial B2B de VentaNexIA. Encuentra posibles clientes REALES y actuales usando internet.\n\nPETICIÓN: ${need}\n\nREGLAS OBLIGATORIAS:\n1. Respeta el tipo de cliente pedido. Portasueros + clínicas + Madrid = clínicas/hospitales/centros médicos reales de Madrid, no vendedores de portasueros.\n2. Si el tipo de cliente es genérico, usa el producto para concretarlo. Tiendas + muebles de cocina = tiendas/estudios de cocina.\n3. Solo empresas o negocios reales. Nunca Reddit, Wikipedia, foros, artículos, listados editoriales ni directorios genéricos.\n4. Cada resultado debe incluir al menos una fuente pública concreta; prioriza la web oficial.\n5. No inventes nombre, teléfono, email, dirección, web ni actividad. Si no aparece, déjalo vacío.\n6. No afirmes que quieren comprar; explica por qué pueden encajar por su actividad.\n7. Devuelve de 1 a 5 resultados correctos, mejor menos que dudosos.\n\nDevuelve SOLO JSON válido con este formato exacto:\n{"interpreted":{"sells":"","clientType":"","zone":"","summary":""},"leads":[{"name":"","activity":"","address":"","phone":"","email":"","website":"","fit":"","evidence":"","sources":[""]}]}`;
}

function parseResearchResult(parsed, input, provider) {
  const leads = (Array.isArray(parsed?.leads) ? parsed.leads : [])
    .map(normalizeLead)
    .filter(plausibleBusiness)
    .slice(0, 5);
  if (!leads.length) throw new Error(`${provider}_NO_REAL_RESULTS`);
  return {
    interpreted: {
      sells: clean(parsed?.interpreted?.sells || input.sells, 180),
      clientType: clean(parsed?.interpreted?.clientType || input.clientType, 180),
      zone: clean(parsed?.interpreted?.zone || input.zone, 180),
      summary: clean(parsed?.interpreted?.summary || userNeed(input), 420)
    },
    leads,
    provider
  };
}

async function callGooglePlaces(input) {
  const key = String(process.env.GOOGLE_PLACES_API_KEY || "").trim();
  if (!key || !input.clientType || !input.zone) return null;
  const generic = /^(tiendas?|comercios?|empresas?|negocios?|distribuidores?|mayoristas?)$/i.test(clean(input.clientType));
  const q = generic && input.sells
    ? `${input.clientType} ${input.sells} en ${input.zone}, España`
    : `${input.clientType} en ${input.zone}, España`;
  const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.googleMapsUri,places.primaryTypeDisplayName"
    },
    body: JSON.stringify({ textQuery: q, languageCode: "es", regionCode: "ES", pageSize: 8 })
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`GOOGLE_PLACES_${r.status}`);
  const leads = (data?.places || []).map(p => normalizeLead({
    name: p?.displayName?.text || "",
    activity: p?.primaryTypeDisplayName?.text || input.clientType,
    address: p?.formattedAddress || "",
    phone: p?.nationalPhoneNumber || "",
    email: "",
    website: p?.websiteUri || "",
    fit: input.sells ? `Por su actividad como ${input.clientType} en ${input.zone}, puede ser un posible comprador de ${input.sells}.` : `Encaja con el tipo de cliente buscado en ${input.zone}.`,
    evidence: "Resultado localizado mediante Google Places.",
    sources: [p?.websiteUri, p?.googleMapsUri].filter(Boolean)
  })).filter(x => x.name && (x.website || x.sources.length)).slice(0, 5);
  if (!leads.length) return null;
  return { interpreted: { sells: clean(input.sells), clientType: clean(input.clientType), zone: clean(input.zone), summary: clean(userNeed(input), 420) }, leads, provider: "google-places" };
}

async function callSonar(input) {
  const key = String(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN || "").trim();
  if (!key) return null;
  const r = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "perplexity/sonar-pro",
      messages: [{ role: "user", content: researchPrompt(input) }],
      temperature: 0,
      max_tokens: 3200
    })
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`SONAR_${r.status}`);
  const parsed = extractJson(data?.choices?.[0]?.message?.content || "");
  return parseResearchResult(parsed, input, "sonar-web-search");
}

async function callOpenAI(input) {
  const key = String(process.env.OPENAI_API_KEY || "").trim();
  if (!key) return null;
  const configured = String(process.env.OPENAI_MODEL || "gpt-5-mini").trim();
  const model = configured.startsWith("openai/") ? configured.slice(7) : configured;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  try {
    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: controller.signal,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, tools: [{ type: "web_search" }], input: researchPrompt(input), max_output_tokens: 3600 })
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`OPENAI_${r.status}:${clean(data?.error?.message || "", 220)}`);
    const parsed = extractJson(responseText(data));
    return parseResearchResult(parsed, input, "openai-web-search");
  } finally {
    clearTimeout(timer);
  }
}

async function callNominatim(input) {
  if (!input.clientType || !input.zone) return null;
  const generic = /^(tiendas?|comercios?|empresas?|negocios?)$/i.test(clean(input.clientType));
  const q = generic && input.sells ? `${input.sells} ${input.zone}, España` : `${input.clientType} ${input.zone}, España`;
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&extratags=1&namedetails=1&limit=10&countrycodes=es&q=${encodeURIComponent(q)}`;
  const r = await fetch(url, { headers: { "user-agent": "VentaNexIA/1.0 (https://www.ventanexia.es; ventas@ventanexia.es)", "accept-language": "es" } });
  if (!r.ok) throw new Error(`OSM_${r.status}`);
  const data = await r.json().catch(() => []);
  const leads = (Array.isArray(data) ? data : []).map(x => {
    const tags = x?.extratags || {};
    const name = x?.namedetails?.name || x?.name || String(x?.display_name || "").split(",")[0];
    const website = tags.website || tags["contact:website"] || "";
    const phone = tags.phone || tags["contact:phone"] || "";
    const email = tags.email || tags["contact:email"] || "";
    const osmUrl = x?.osm_type && x?.osm_id ? `https://www.openstreetmap.org/${x.osm_type}/${x.osm_id}` : "";
    return normalizeLead({
      name,
      activity: input.clientType,
      address: x?.display_name || "",
      phone,
      email,
      website,
      fit: input.sells ? `Negocio localizado en ${input.zone} que coincide con el tipo de cliente buscado y podría necesitar ${input.sells}.` : `Negocio localizado en ${input.zone} que coincide con el tipo de cliente buscado.`,
      evidence: "Registro público de OpenStreetMap.",
      sources: [website, osmUrl].filter(Boolean)
    });
  }).filter(x => x.name && x.sources.length).slice(0, 5);
  if (!leads.length) return null;
  return { interpreted: { sells: clean(input.sells), clientType: clean(input.clientType), zone: clean(input.zone), summary: clean(userNeed(input), 420) }, leads, provider: "openstreetmap" };
}

async function findProspects(input) {
  const errors = [];
  const providers = [
    ["google", callGooglePlaces],
    ["sonar", callSonar],
    ["openai", callOpenAI],
    ["osm", callNominatim]
  ];
  for (const [name, fn] of providers) {
    try {
      const result = await fn(input);
      if (result?.leads?.length) return { ...result, diagnostics: errors };
    } catch (e) {
      const msg = `${name}:${String(e?.message || e)}`;
      errors.push(msg);
      console.error("prospect-search-provider", msg);
    }
  }
  const err = new Error(errors.join(" | ") || "NO_RESULTS");
  err.diagnostics = errors;
  throw err;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });
  const request = clean(req.body?.request, 900);
  const sells = clean(req.body?.sells, 180);
  const clientType = clean(req.body?.clientType, 180);
  const zone = clean(req.body?.zone, 180);
  if (!request && !(sells && clientType && zone)) {
    return res.status(400).json({ error: "Escribe qué vendes, qué tipo de cliente buscas y la zona." });
  }
  try {
    const result = await findProspects({ request, sells, clientType, zone });
    return res.status(200).json({
      query: result.interpreted,
      leads: result.leads,
      sourceMode: result.provider,
      verificationMessage: "Empresas localizadas en fuentes públicas. Los datos de contacto solo se muestran cuando aparecen publicados."
    });
  } catch (error) {
    console.error("prospect-search", error);
    return res.status(502).json({
      error: "No hemos podido consultar las fuentes de búsqueda en este momento. No vamos a inventar resultados.",
      code: "PROSPECT_SEARCH_UNAVAILABLE"
    });
  }
}
