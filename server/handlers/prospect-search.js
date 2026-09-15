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

async function fetchText(url, timeout = 7000) {
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
  const urls = [website, `${origin}/contacto`, `${origin}/contact`, `${origin}/es/contacto`, `${origin}/contacta`];
  for (const url of urls) {
    try {
      const html = await fetchText(url, 5000);
      const email = firstEmail(stripHtml(html).slice(0, 80000));
      if (email) return email;
    } catch {}
  }
  return "";
}

function fitText(sells, clientType, zone) {
  return `Es un negocio del tipo “${clean(clientType, 100)}” en ${clean(zone, 80)} y, por su actividad, puede ser un posible comprador de ${clean(sells, 120)}.`;
}

async function searchGooglePlaces({ sells, clientType, zone }) {
  const key = String(process.env.GOOGLE_PLACES_API_KEY || "").trim();
  if (!key) return [];

  // IMPORTANTE: descubrimos por TIPO DE CLIENTE + POBLACIÓN. El producto se usa después para valorar el encaje.
  const textQuery = `${clientType} en ${zone}, España`;
  const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.types,places.businessStatus,places.googleMapsUri"
    },
    body: JSON.stringify({ textQuery, languageCode: "es", regionCode: "ES", pageSize: 10 })
  });
  if (!r.ok) throw new Error(`GOOGLE_PLACES_${r.status}`);
  const data = await r.json();
  const places = Array.isArray(data?.places) ? data.places : [];
  const leads = [];
  for (const p of places) {
    if (p?.businessStatus && p.businessStatus !== "OPERATIONAL") continue;
    const website = clean(p?.websiteUri, 300);
    const email = await enrichEmail(website);
    leads.push({
      name: clean(p?.displayName?.text, 120),
      activity: clean(clientType, 160),
      address: clean(p?.formattedAddress, 220),
      phone: clean(p?.nationalPhoneNumber, 80),
      email,
      website,
      fit: fitText(sells, clientType, zone),
      sources: [website || clean(p?.googleMapsUri, 350)].filter(Boolean)
    });
    if (leads.length >= 3) break;
  }
  return leads.filter(x => x.name);
}

async function searchSerpApi({ sells, clientType, zone }) {
  const key = String(process.env.SERPAPI_API_KEY || "").trim();
  if (!key) return [];
  const params = new URLSearchParams({
    engine: "google_maps",
    type: "search",
    q: `${clientType} en ${zone}, España`,
    hl: "es",
    gl: "es",
    api_key: key
  });
  const r = await fetch(`https://serpapi.com/search.json?${params.toString()}`);
  if (!r.ok) throw new Error(`SERPAPI_${r.status}`);
  const data = await r.json();
  const rows = Array.isArray(data?.local_results) ? data.local_results : [];
  const leads = [];
  for (const x of rows) {
    const website = clean(x?.website || x?.links?.website || "", 300);
    const email = await enrichEmail(website);
    leads.push({
      name: clean(x?.title, 120),
      activity: clean(x?.type || clientType, 160),
      address: clean(x?.address, 220),
      phone: clean(x?.phone, 80),
      email,
      website,
      fit: fitText(sells, clientType, zone),
      sources: [website].filter(Boolean)
    });
    if (leads.length >= 3) break;
  }
  return leads.filter(x => x.name);
}

async function searchTavily({ sells, clientType, zone }) {
  const key = String(process.env.TAVILY_API_KEY || "").trim();
  if (!key) return [];
  const r = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
    body: JSON.stringify({
      query: `${clientType} en ${zone} España empresa contacto web oficial`,
      search_depth: "advanced",
      max_results: 10,
      include_answer: false,
      include_raw_content: true
    })
  });
  if (!r.ok) throw new Error(`TAVILY_${r.status}`);
  const data = await r.json();
  const rows = Array.isArray(data?.results) ? data.results : [];
  const leads = [];
  const seen = new Set();
  for (const x of rows) {
    let website = clean(x?.url, 300);
    let host = "";
    try { host = new URL(website).hostname.replace(/^www\./, ""); } catch {}
    if (!host || seen.has(host)) continue;
    seen.add(host);
    const text = stripHtml(x?.raw_content || x?.content || "").slice(0, 80000);
    const email = firstEmail(text) || await enrichEmail(website);
    leads.push({
      name: clean(x?.title?.split(/[|–—]/)[0], 120) || host,
      activity: clean(clientType, 160),
      address: "",
      phone: "",
      email,
      website,
      fit: fitText(sells, clientType, zone),
      sources: [website]
    });
    if (leads.length >= 3) break;
  }
  return leads;
}

async function findProspects(input) {
  const providers = [
    ["google-places", searchGooglePlaces],
    ["serpapi-google-maps", searchSerpApi],
    ["tavily-web", searchTavily]
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
  const configured = Boolean(process.env.GOOGLE_PLACES_API_KEY || process.env.SERPAPI_API_KEY || process.env.TAVILY_API_KEY);
  if (!configured) throw new Error("SEARCH_PROVIDER_NOT_CONFIGURED");
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
    const code = String(error?.message || error);
    if (code === "SEARCH_PROVIDER_NOT_CONFIGURED") {
      return res.status(503).json({ error: "El buscador comercial todavía necesita conectar un proveedor de búsqueda empresarial." });
    }
    return res.status(502).json({ error: "No se han podido obtener negocios verificables para esa búsqueda. Inténtalo de nuevo." });
  }
}
