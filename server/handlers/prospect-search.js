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
    ? item.sources.map(x => clean(x, 400)).filter(x => /^https?:\/\//i.test(x)).slice(0, 5)
    : [];
  return {
    name: clean(item?.name, 140),
    activity: clean(item?.activity || clientType, 180),
    address: clean(item?.address, 240),
    phone: clean(item?.phone, 100),
    email: clean(item?.email, 180),
    website,
    fit: clean(item?.fit || `Por su actividad en ${zone}, puede ser un posible comprador de ${sells}.`, 340),
    sources: sources.length ? sources : (website ? [website] : [])
  };
}

async function fetchText(url, timeout = 5000) {
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
    return await r.text();
  } finally { clearTimeout(timer); }
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
      const html = await fetchText(url, 4000);
      const email = firstEmail(stripHtml(html).slice(0, 80000));
      if (email) return email;
    } catch {}
  }
  return "";
}

function researchPrompt({ sells, clientType, zone }) {
  return `Actúa como investigador comercial B2B en España.

OBJETIVO
Encuentra exactamente 3 negocios REALES que puedan ser compradores potenciales de lo que vende el visitante.

DATOS
- Vende: ${sells}
- Quiere vender a: ${clientType}
- Zona/población: ${zone}, España

MÉTODO OBLIGATORIO
1. Busca primero negocios reales del tipo "${clientType}" ubicados en "${zone}" o que operen claramente allí.
2. NO busques empresas que vendan ${sells}. Buscamos COMPRADORES potenciales, no competidores.
3. Verifica cada negocio con web oficial, ficha pública empresarial, directorio fiable o fuente local pública.
4. Selecciona 3 negocios que por actividad tengan sentido como compradores de ${sells}.
5. Solo usa datos empresariales públicos encontrados. NO inventes dirección, teléfono, email ni web; si no aparece, devuelve "".
6. En sources pon URLs reales consultadas.
7. En fit explica en una frase concreta por qué ese negocio podría comprar ${sells}.
8. Devuelve SOLO JSON válido, sin markdown.

FORMATO EXACTO
{"leads":[{"name":"","activity":"","address":"","phone":"","email":"","website":"","fit":"","sources":["https://..."]},{"name":"","activity":"","address":"","phone":"","email":"","website":"","fit":"","sources":["https://..."]},{"name":"","activity":"","address":"","phone":"","email":"","website":"","fit":"","sources":["https://..."]}]}`;
}

function responseOutputText(data) {
  if (typeof data?.output_text === "string") return data.output_text;
  const parts = [];
  for (const item of Array.isArray(data?.output) ? data.output : []) {
    if (item?.type !== "message") continue;
    for (const c of Array.isArray(item?.content) ? item.content : []) {
      if ((c?.type === "output_text" || c?.type === "text") && typeof c?.text === "string") parts.push(c.text);
    }
  }
  return parts.join("\n");
}

async function searchOpenAIWeb(input) {
  const key = String(process.env.OPENAI_API_KEY || "").trim();
  if (!key) return [];
  const r = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-5.6-luna",
      tools: [{
        type: "web_search",
        search_context_size: "medium",
        user_location: { type: "approximate", country: "ES", city: clean(input.zone, 100) }
      }],
      input: researchPrompt(input),
      max_output_tokens: 2600
    })
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`OPENAI_WEB_${r.status}:${clean(data?.error?.message || data?.error || "", 180)}`);
  const parsed = extractJson(responseOutputText(data));
  const leads = Array.isArray(parsed?.leads)
    ? parsed.leads.map(x => normalizeLead(x, input.sells, input.clientType, input.zone)).filter(x => x.name).slice(0, 3)
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
  const leads = [];
  for (const p of Array.isArray(data?.places) ? data.places : []) {
    if (p?.businessStatus && p.businessStatus !== "OPERATIONAL") continue;
    const website = clean(p?.websiteUri, 320);
    leads.push({
      name: clean(p?.displayName?.text, 140), activity: clean(clientType, 180),
      address: clean(p?.formattedAddress, 240), phone: clean(p?.nationalPhoneNumber, 100),
      email: website ? await enrichEmail(website) : "", website,
      fit: `Por su actividad en ${zone}, puede ser un posible comprador de ${sells}.`,
      sources: [website || clean(p?.googleMapsUri, 400)].filter(Boolean)
    });
    if (leads.length >= 3) break;
  }
  return leads.filter(x => x.name);
}

async function searchGatewaySonar(input) {
  const key = String(process.env.AI_GATEWAY_API_KEY || "").trim();
  if (!key) return [];
  const r = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "perplexity/sonar-pro",
      messages: [{ role: "user", content: researchPrompt(input) }],
      temperature: 0.1,
      max_tokens: 2600
    })
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`SONAR_${r.status}:${clean(data?.error?.message || data?.error || "", 180)}`);
  const content = data?.choices?.[0]?.message?.content;
  const parsed = extractJson(typeof content === "string" ? content : "");
  return Array.isArray(parsed?.leads)
    ? parsed.leads.map(x => normalizeLead(x, input.sells, input.clientType, input.zone)).filter(x => x.name).slice(0, 3)
    : [];
}

async function findProspects(input) {
  const providers = [
    ["openai-web-search", searchOpenAIWeb],
    ["google-places", searchGooglePlaces],
    ["sonar-web-search", searchGatewaySonar]
  ];
  const errors = [];
  for (const [name, fn] of providers) {
    try {
      const leads = await fn(input);
      if (leads.length >= 3) return { leads: leads.slice(0, 3), provider: name };
      if (leads.length) return { leads, provider: name };
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
    if (!result.leads.length) throw new Error("NO_RESULTS");
    return res.status(200).json({
      query: { sells, clientType, zone }, leads: result.leads,
      verified: true, sourceMode: result.provider
    });
  } catch (error) {
    console.error("prospect-search", error);
    return res.status(502).json({ error: "No hemos podido completar esta búsqueda ahora mismo. Estamos revisando la conexión del buscador." });
  }
}
