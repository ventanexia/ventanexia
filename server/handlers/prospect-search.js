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

async function fetchText(url, timeout = 6000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const r = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36",
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

  const prompt = `Busca clientes potenciales REALES en España para una demostración comercial.

DATOS DEL VISITANTE
- Vende: ${sells}
- Quiere vender a: ${clientType}
- Población/zona: ${zone}, España

MÉTODO OBLIGATORIO
1. Haz búsqueda web EN TIEMPO REAL.
2. Busca primero negocios del tipo "${clientType}" en "${zone}". NO busques empresas que vendan ${sells}; buscamos posibles COMPRADORES de ${sells}.
3. Selecciona 3 empresas/establecimientos reales que encajen como compradores potenciales.
4. Verifica cada una con su web oficial o una fuente pública fiable.
5. Solo devuelve datos empresariales públicos que hayas encontrado. NO inventes teléfono, email, web ni dirección. Si no aparece, deja "".
6. La empresa debe estar en ${zone} o prestar servicio claramente allí.
7. En fit explica brevemente por qué podría comprar ${sells}.
8. Devuelve SOLO JSON válido, sin markdown ni comentarios.

FORMATO EXACTO
{"leads":[{"name":"","activity":"","address":"","phone":"","email":"","website":"","fit":"","sources":["https://..."]},{"name":"","activity":"","address":"","phone":"","email":"","website":"","fit":"","sources":["https://..."]},{"name":"","activity":"","address":"","phone":"","email":"","website":"","fit":"","sources":["https://..."]}]}`;

  const r = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "perplexity/sonar-pro",
      messages: [
        { role: "system", content: "Eres un investigador comercial B2B en España. Tu prioridad es encontrar empresas reales y verificables en la web, nunca inventar datos." },
        { role: "user", content: prompt }
      ],
      temperature: 0.1,
      max_tokens: 2200
    })
  });

  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`AI_GATEWAY_${r.status}:${clean(data?.error?.message || data?.error || "", 180)}`);
  const content = data?.choices?.[0]?.message?.content;
  const text = typeof content === "string"
    ? content
    : Array.isArray(content) ? content.map(x => x?.text || "").join("\n") : "";
  const parsed = extractJson(text);
  let leads = Array.isArray(parsed?.leads)
    ? parsed.leads.map(x => normalizeLead(x, sells, clientType, zone)).filter(x => x.name).slice(0, 3)
    : [];

  // Si Sonar no encontró email pero sí web, intentamos localizar un email público en la web oficial.
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

async function findProspects(input) {
  const providers = [
    ["ai-gateway-sonar", searchWithGatewaySonar],
    ["google-places", searchGooglePlaces]
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
    return res.status(502).json({ error: "No hemos podido completar esta búsqueda ahora mismo. Vuelve a pulsar Buscar; si persiste, estamos revisando la conexión del buscador." });
  }
}
