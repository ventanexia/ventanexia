function clean(value, max = 220) {
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

function decodeXml(s = "") {
  return String(s)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
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
  "youtube.com", "x.com", "twitter.com", "pinterest.", "tiktok.com", "bing.com",
  "tripadvisor.", "yelp.", "paginasamarillas.", "habitissimo."
];

function isGoogleMapsUrl(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    return (host.includes("google.") || host === "maps.app.goo.gl") && (u.pathname.includes("/maps") || host === "maps.app.goo.gl");
  } catch { return false; }
}

function isBlockedUrl(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes("google.") && !isGoogleMapsUrl(url)) return true;
    return BLOCKED_HOSTS.some(x => host.includes(x));
  } catch { return true; }
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
    name: clean(item?.name, 160), activity: clean(item?.activity, 220),
    address: clean(item?.address, 280), phone: clean(item?.phone, 120),
    email: clean(item?.email, 200), website: isBusinessWebsite(website) ? website : "",
    fit: clean(item?.fit, 420), sources
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
  if (!n || n.length < 2 || n.length > 120) return false;
  const bad = ["reddit", "wiki", "wikipedia", "forum", "foro", "thread", "r/", "quora", "claustrophobic", "mejores ", "top 10", "guía de", "guia de"];
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

function fold(s = "") {
  return String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function significantWords(s = "") {
  const stop = new Set(["de","del","la","las","el","los","y","en","para","por","un","una","unos","unas","empresa","empresas","negocio","negocios"]);
  return fold(s).replace(/[^a-z0-9ñ ]/g, " ").split(/\s+/).filter(w => w.length >= 4 && !stop.has(w));
}

function genericClientType(type = "") {
  return /^(tiendas?|comercios?|distribuidores?|mayoristas?|minoristas?|proveedores?|empresas?|negocios?)$/i.test(clean(type));
}

async function fetchText(url, timeout = 6500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const r = await fetch(url, {
      signal: controller.signal, redirect: "follow",
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; VentaNexIA/1.0; +https://www.ventanexia.es)",
        "accept-language": "es-ES,es;q=0.9"
      }
    });
    if (!r.ok) throw new Error(`HTTP_${r.status}`);
    return await r.text();
  } finally { clearTimeout(timer); }
}

function parseBingRss(xml) {
  const items = [];
  const re = /<item>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = re.exec(xml)) && items.length < 20) {
    const block = m[1];
    const title = decodeXml(block.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || "");
    const link = decodeXml(block.match(/<link>([\s\S]*?)<\/link>/i)?.[1] || "");
    const description = stripHtml(decodeXml(block.match(/<description>([\s\S]*?)<\/description>/i)?.[1] || ""));
    if (/^https?:\/\//i.test(link) && title) items.push({ title: clean(title, 180), url: clean(link, 500), description: clean(description, 600) });
  }
  return items;
}

function extractContact(html) {
  const text = stripHtml(html).slice(0, 140000);
  const email = (text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i) || [""])[0];
  const phone = (text.match(/(?:\+34[\s.-]?)?(?:[6789]\d{2})[\s.-]?\d{3}[\s.-]?\d{3}/) || [""])[0];
  const siteName = html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i)?.[1];
  const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "";
  const title = stripHtml(siteName || titleTag).split(/[|–—]/)[0].trim();
  return { title: clean(title, 120), email: clean(email, 180), phone: clean(phone, 100), text };
}

function businessSearchQueries(input) {
  const type = clean(input.clientType, 180);
  const sells = clean(input.sells, 180);
  const zone = clean(input.zone, 180);
  const q = [];
  if (type && zone) {
    if (genericClientType(type) && sells) {
      q.push(`${type} ${sells} ${zone}`);
      q.push(`${sells} ${zone} tienda contacto`);
    } else {
      q.push(`${type} ${zone}`);
      q.push(`${type} ${zone} contacto`);
    }
  }
  if (input.request) q.push(`${clean(input.request, 350)} empresa contacto`);
  return [...new Set(q)].slice(0, 3);
}

function pageMatchesBuyer(input, row, pageText) {
  const hay = fold(`${row.title} ${row.description} ${pageText}`);
  const zoneWords = significantWords(input.zone);
  if (zoneWords.length && !zoneWords.some(w => hay.includes(w))) return false;

  if (input.clientType && !genericClientType(input.clientType)) {
    const typeWords = significantWords(input.clientType).map(w => w.replace(/(es|s)$/i, ""));
    if (typeWords.length && !typeWords.some(w => hay.includes(w))) {
      const t = fold(input.clientType);
      const medical = /clinic|hospital|sanitari|medic/.test(t) && /clinic|hospital|centro medic|salud|sanitari/.test(hay);
      if (!medical) return false;
    }
  }

  if (genericClientType(input.clientType) && input.sells) {
    const sellsWords = significantWords(input.sells).map(w => w.replace(/(es|s)$/i, ""));
    if (sellsWords.length && !sellsWords.some(w => hay.includes(w))) return false;
  }
  return true;
}

async function callPublicWebFallback(input) {
  const queries = businessSearchQueries(input);
  if (!queries.length) return null;

  const seen = new Set();
  const rows = [];
  for (const q of queries) {
    try {
      const xml = await fetchText(`https://www.bing.com/search?format=rss&setlang=es&q=${encodeURIComponent(q)}`, 7000);
      for (const row of parseBingRss(xml)) {
        if (!isBusinessWebsite(row.url)) continue;
        let host = "";
        try { host = new URL(row.url).hostname.replace(/^www\./, "").toLowerCase(); } catch {}
        if (!host || seen.has(host)) continue;
        seen.add(host);
        rows.push(row);
      }
    } catch (e) { console.error("public-search-rss", e); }
    if (rows.length >= 14) break;
  }

  const leads = [];
  for (const row of rows.slice(0, 14)) {
    try {
      const html = await fetchText(row.url, 6000);
      const c = extractContact(html);
      if (!pageMatchesBuyer(input, row, c.text)) continue;
      const name = c.title || row.title;
      if (!looksLikeRealBusinessName(name)) continue;
      let website = row.url;
      try { website = new URL(row.url).origin + "/"; } catch {}
      leads.push(normalizeLead({
        name,
        activity: input.clientType || "Posible cliente",
        address: "",
        phone: c.phone,
        email: c.email,
        website,
        fit: input.sells
          ? `Su web pública encaja con el tipo de cliente solicitado en ${input.zone || "la zona indicada"}; por su actividad puede ser un posible comprador de ${input.sells}.`
          : `Su web pública encaja con el tipo de cliente solicitado en ${input.zone || "la zona indicada"}.`,
        sources: [website]
      }));
      if (leads.length >= 3) break;
    } catch (e) { console.error("public-search-page", e); }
  }

  if (!leads.length) return null;
  return {
    interpreted: {
      sells: clean(input.sells), clientType: clean(input.clientType || "Posibles clientes"),
      zone: clean(input.zone), summary: clean(userNeed(input), 420)
    },
    leads,
    provider: "public-web-verified"
  };
}

async function callOpenAI(input) {
  const key = String(process.env.OPENAI_API_KEY || "").trim();
  if (!key) return null;
  const need = userNeed(input);
  const prompt = `Eres el motor de prospección comercial de VentaNexIA. Encuentra empresas REALES que encajen exactamente con lo pedido. Si el usuario indica TIPO DE CLIENTE, ese es el criterio principal: portasueros + clínicas + Madrid significa clínicas reales de Madrid, no vendedores de portasueros. Si el tipo es genérico como tiendas, usa el producto para concretar el sector. Devuelve solo negocios reales con web oficial o fuente pública verificable. Nunca Reddit, Wikipedia, foros, artículos o directorios genéricos. No inventes ningún dato; deja vacío lo que no encuentres. Es mejor devolver menos de 3 que datos dudosos. Devuelve SOLO JSON válido con interpreted{sells,clientType,zone,summary} y leads[{name,activity,address,phone,email,website,fit,sources}]. PETICIÓN: ${need}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST", signal: controller.signal,
      headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-5.6-luna", tools: [{ type: "web_search" }], input: prompt, max_output_tokens: 3000 })
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`OPENAI_${r.status}:${clean(data?.error?.message || "", 180)}`);
    const parsed = extractJson(responseText(data));
    const leads = verifyAiLeads(Array.isArray(parsed?.leads) ? parsed.leads : []);
    if (!leads.length) throw new Error("OPENAI_NO_VERIFIED_BUSINESSES");
    return { interpreted: {
      sells: clean(parsed?.interpreted?.sells || input.sells, 180),
      clientType: clean(parsed?.interpreted?.clientType || input.clientType, 180),
      zone: clean(parsed?.interpreted?.zone || input.zone, 180),
      summary: clean(parsed?.interpreted?.summary || need, 420)
    }, leads, provider: "openai-web-search" };
  } finally { clearTimeout(timer); }
}

function googleBuyerQuery(input) {
  const type = clean(input.clientType, 180), zone = clean(input.zone, 180), sells = clean(input.sells, 180);
  if (!type || !zone) return "";
  return genericClientType(type) && sells ? `${type} ${sells} en ${zone}, España` : `${type} en ${zone}, España`;
}

async function callGooglePlaces(input) {
  const key = String(process.env.GOOGLE_PLACES_API_KEY || "").trim();
  if (!key || !input.clientType || !input.zone) return null;
  const query = googleBuyerQuery(input);
  const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.googleMapsUri,places.types" },
    body: JSON.stringify({ textQuery: query, languageCode: "es", regionCode: "ES", pageSize: 10 })
  });
  if (!r.ok) throw new Error(`GOOGLE_PLACES_${r.status}`);
  const data = await r.json();
  const leads = (data?.places || []).map(p => normalizeLead({
    name: p?.displayName?.text || "", activity: input.clientType,
    address: p?.formattedAddress || "", phone: p?.nationalPhoneNumber || "", email: "",
    website: p?.websiteUri || "",
    fit: input.sells ? `${p?.displayName?.text || "Este negocio"} figura como ${input.clientType} en ${input.zone}; por ese tipo de actividad puede ser un comprador potencial de ${input.sells}.` : `${p?.displayName?.text || "Este negocio"} figura como ${input.clientType} en ${input.zone}.`,
    sources: [p?.websiteUri, p?.googleMapsUri].filter(Boolean)
  })).filter(x => looksLikeRealBusinessName(x.name) && x.address && x.sources.length).slice(0, 3);
  if (!leads.length) return null;
  return { interpreted: { sells: clean(input.sells), clientType: clean(input.clientType), zone: clean(input.zone), summary: clean(userNeed(input), 420) }, leads, provider: "google-places" };
}

async function callSonar(input) {
  const key = String(process.env.AI_GATEWAY_API_KEY || "").trim();
  if (!key) return null;
  const need = userNeed(input);
  const r = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "perplexity/sonar-pro", messages: [{ role: "user", content: `Busca empresas REALES que encajen exactamente con esta petición comercial: ${need}. Respeta el tipo de cliente como criterio principal; no busques vendedores del producto si se pide otro tipo de comprador. Prohibido Reddit, Wikipedia, foros, artículos o directorios genéricos. No inventes datos. Devuelve SOLO JSON con interpreted{sells,clientType,zone,summary} y leads[{name,activity,address,phone,email,website,fit,sources}].` }], temperature: 0, max_tokens: 2800 })
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`SONAR_${r.status}`);
  const parsed = extractJson(data?.choices?.[0]?.message?.content || "");
  const leads = verifyAiLeads(Array.isArray(parsed?.leads) ? parsed.leads : []);
  if (!leads.length) throw new Error("SONAR_NO_VERIFIED_BUSINESSES");
  return { interpreted: {
    sells: clean(parsed?.interpreted?.sells || input.sells, 180),
    clientType: clean(parsed?.interpreted?.clientType || input.clientType, 180),
    zone: clean(parsed?.interpreted?.zone || input.zone, 180),
    summary: clean(parsed?.interpreted?.summary || need, 420)
  }, leads, provider: "sonar-web-search" };
}

async function findProspects(input) {
  const errors = [];
  const providers = input.clientType && input.zone
    ? [["google", callGooglePlaces], ["public", callPublicWebFallback], ["openai", callOpenAI], ["sonar", callSonar]]
    : [["public", callPublicWebFallback], ["openai", callOpenAI], ["sonar", callSonar]];
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
  if (!request && !(sells && clientType && zone)) return res.status(400).json({ error: "Escribe qué quieres encontrar o completa qué vendes, tipo de cliente y zona." });
  try {
    const result = await findProspects({ request, sells, clientType, zone });
    return res.status(200).json({
      query: result.interpreted, leads: result.leads, verified: true, sourceMode: result.provider,
      verificationMessage: "Resultados obtenidos de fuentes públicas. No inventamos datos de contacto: si no están publicados, se dejan vacíos."
    });
  } catch (error) {
    console.error("prospect-search", error);
    return res.status(502).json({ error: "No hemos podido localizar ahora mismo negocios reales que coincidan con la búsqueda. Prueba de nuevo o concreta el tipo de cliente y la zona." });
  }
}
