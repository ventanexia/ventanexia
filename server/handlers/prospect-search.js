function clean(value, max = 220) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, max);
}

function stripHtml(s = "") {
  return String(s).replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/\s+/g, " ").trim();
}

function decodeXml(s = "") {
  return String(s).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
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

function normalizeLead(item) {
  const sources = Array.isArray(item?.sources) ? item.sources.map(x => clean(x, 500)).filter(x => /^https?:\/\//i.test(x)).slice(0, 5) : [];
  return {
    name: clean(item?.name, 160),
    activity: clean(item?.activity, 220),
    address: clean(item?.address, 280),
    phone: clean(item?.phone, 120),
    email: clean(item?.email, 200),
    website: clean(item?.website, 380),
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

async function callOpenAI(input) {
  const key = String(process.env.OPENAI_API_KEY || "").trim();
  if (!key) return null;
  const need = userNeed(input);
  const prompt = `Eres el motor de prospección comercial de VentaNexIA. Entiende la necesidad aunque esté escrita de forma coloquial. Busca exactamente 3 compradores potenciales REALES en internet. No busques competidores ni vendedores del mismo producto salvo que se pida. Verifica cada empresa con fuentes públicas. Nunca inventes datos. Devuelve SOLO JSON válido con interpreted{sells,clientType,zone,summary} y leads[{name,activity,address,phone,email,website,fit,sources}].\n\nPETICIÓN: ${need}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 28000);
  try {
    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: controller.signal,
      headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-5.6-luna", tools: [{ type: "web_search" }], input: prompt, max_output_tokens: 2800 })
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`OPENAI_${r.status}:${clean(data?.error?.message || "", 180)}`);
    const parsed = extractJson(responseText(data));
    const leads = Array.isArray(parsed?.leads) ? parsed.leads.map(normalizeLead).filter(x => x.name).slice(0, 3) : [];
    if (!leads.length) throw new Error("OPENAI_NO_RESULTS");
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
  } finally { clearTimeout(timer); }
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
      messages: [{ role: "user", content: `Busca en la web 3 compradores potenciales REALES para esta petición: ${need}. No inventes datos. Devuelve SOLO JSON con interpreted{sells,clientType,zone,summary} y leads[{name,activity,address,phone,email,website,fit,sources}].` }],
      temperature: 0.1,
      max_tokens: 2600
    })
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`SONAR_${r.status}`);
  const parsed = extractJson(data?.choices?.[0]?.message?.content || "");
  const leads = Array.isArray(parsed?.leads) ? parsed.leads.map(normalizeLead).filter(x => x.name).slice(0, 3) : [];
  if (!leads.length) throw new Error("SONAR_NO_RESULTS");
  return {
    interpreted: {
      sells: clean(parsed?.interpreted?.sells || input.sells, 180),
      clientType: clean(parsed?.interpreted?.clientType || input.clientType, 180),
      zone: clean(parsed?.interpreted?.zone || input.zone, 180),
      summary: clean(parsed?.interpreted?.summary || need, 420)
    }, leads, provider: "sonar-web-search"
  };
}

async function callGooglePlaces(input) {
  const key = String(process.env.GOOGLE_PLACES_API_KEY || "").trim();
  if (!key || !input.clientType || !input.zone) return null;
  const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.googleMapsUri" },
    body: JSON.stringify({ textQuery: `${input.clientType} en ${input.zone}, España`, languageCode: "es", regionCode: "ES", pageSize: 8 })
  });
  if (!r.ok) throw new Error(`GOOGLE_PLACES_${r.status}`);
  const data = await r.json();
  const leads = (data?.places || []).slice(0, 3).map(p => normalizeLead({
    name: p?.displayName?.text,
    activity: input.clientType,
    address: p?.formattedAddress,
    phone: p?.nationalPhoneNumber,
    email: "",
    website: p?.websiteUri,
    fit: `Por su actividad en ${input.zone}, puede ser un posible comprador de ${input.sells || "lo que ofrece el visitante"}.`,
    sources: [p?.websiteUri || p?.googleMapsUri].filter(Boolean)
  })).filter(x => x.name);
  if (!leads.length) return null;
  return { interpreted: { sells: clean(input.sells), clientType: clean(input.clientType), zone: clean(input.zone), summary: userNeed(input) }, leads, provider: "google-places" };
}

async function fetchText(url, timeout = 7000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const r = await fetch(url, { signal: controller.signal, redirect: "follow", headers: { "user-agent": "Mozilla/5.0 (compatible; VentaNexIA/1.0; +https://www.ventanexia.es)", "accept-language": "es-ES,es;q=0.9" } });
    if (!r.ok) throw new Error(`HTTP_${r.status}`);
    return await r.text();
  } finally { clearTimeout(timer); }
}

function parseBingRss(xml) {
  const items = [];
  const re = /<item>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = re.exec(xml)) && items.length < 12) {
    const block = m[1];
    const title = decodeXml(block.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || "");
    const link = decodeXml(block.match(/<link>([\s\S]*?)<\/link>/i)?.[1] || "");
    const description = stripHtml(decodeXml(block.match(/<description>([\s\S]*?)<\/description>/i)?.[1] || ""));
    if (/^https?:\/\//i.test(link) && title) items.push({ title: clean(title, 180), url: clean(link, 500), description: clean(description, 500) });
  }
  return items;
}

const BLOCKED = ["bing.com","google.","youtube.com","facebook.com","instagram.com","linkedin.com","wikipedia.org","x.com","twitter.com"];
function acceptableUrl(url) {
  try { const h = new URL(url).hostname.toLowerCase(); return !BLOCKED.some(x => h.includes(x)); } catch { return false; }
}

function extractContact(html) {
  const text = stripHtml(html).slice(0, 100000);
  const email = (text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i) || [""])[0];
  const phone = (text.match(/(?:\+34[\s.-]?)?(?:[6789]\d{2})[\s.-]?\d{3}[\s.-]?\d{3}/) || [""])[0];
  const siteName = html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i)?.[1];
  const title = stripHtml(siteName || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").split(/[|–—]/)[0];
  return { title: clean(title, 160), email: clean(email, 180), phone: clean(phone, 100), text };
}

async function callBingFallback(input) {
  const need = userNeed(input);
  const queries = [];
  if (input.clientType && input.zone) {
    queries.push(`${input.clientType} ${input.zone} contacto`);
    queries.push(`${input.clientType} ${input.zone} empresa`);
  }
  if (input.request) queries.push(`${input.request} España empresa contacto`);
  if (!queries.length) queries.push(`${need} España empresa contacto`);

  const seen = new Set();
  const candidates = [];
  for (const q of queries.slice(0, 3)) {
    try {
      const xml = await fetchText(`https://www.bing.com/search?format=rss&setlang=es&q=${encodeURIComponent(q)}`, 7000);
      for (const row of parseBingRss(xml)) {
        if (!acceptableUrl(row.url)) continue;
        let host = "";
        try { host = new URL(row.url).hostname.replace(/^www\./, "").toLowerCase(); } catch {}
        if (!host || seen.has(host)) continue;
        seen.add(host); candidates.push(row);
      }
    } catch (e) { console.error("bing-rss", e); }
    if (candidates.length >= 8) break;
  }

  const leads = [];
  for (const row of candidates.slice(0, 10)) {
    let name = row.title, email = "", phone = "", website = row.url;
    try {
      const html = await fetchText(row.url, 5500);
      const c = extractContact(html);
      name = c.title || name; email = c.email; phone = c.phone;
      try { website = new URL(row.url).origin + "/"; } catch {}
    } catch {}
    const lower = `${row.title} ${row.description}`.toLowerCase();
    if (input.zone && !lower.includes(input.zone.toLowerCase()) && leads.length >= 2) continue;
    leads.push(normalizeLead({
      name,
      activity: input.clientType || "Posible comprador",
      address: input.zone || "",
      phone,
      email,
      website,
      fit: `Encaja con la búsqueda solicitada y puede ser un posible comprador de ${input.sells || "lo que ofrece el visitante"}.`,
      sources: [row.url]
    }));
    if (leads.length >= 3) break;
  }
  if (!leads.length) return null;
  return {
    interpreted: {
      sells: clean(input.sells, 180),
      clientType: clean(input.clientType || "Compradores potenciales", 180),
      zone: clean(input.zone, 180),
      summary: clean(need, 420)
    },
    leads,
    provider: "bing-web-fallback"
  };
}

async function findProspects(input) {
  const errors = [];
  for (const [name, fn] of [
    ["openai", callOpenAI],
    ["google", callGooglePlaces],
    ["sonar", callSonar],
    ["bing", callBingFallback]
  ]) {
    try {
      const result = await fn(input);
      if (result?.leads?.length) return result;
    } catch (e) {
      errors.push(`${name}:${String(e?.message || e)}`);
      console.error("prospect-search-provider", name, e);
    }
  }
  throw new Error(errors.join(" | ") || "NO_SEARCH_RESULTS");
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
    return res.status(200).json({ query: result.interpreted, leads: result.leads, verified: true, sourceMode: result.provider });
  } catch (error) {
    console.error("prospect-search", error);
    return res.status(502).json({ error: "No hemos podido completar la búsqueda ahora mismo. Prueba de nuevo con una descripción un poco más concreta del tipo de cliente y la zona." });
  }
}
