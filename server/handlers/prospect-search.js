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

async function callOpenAI(input) {
  const key = String(process.env.OPENAI_API_KEY || "").trim();
  if (!key) return null;
  const model = String(process.env.OPENAI_MODEL || "gpt-5-mini").replace(/^openai\//, "");
  const need = userNeed(input);
  const prompt = `Actúas como investigador comercial B2B de VentaNexIA. Tu trabajo es encontrar posibles clientes REALES para una empresa española usando búsqueda web actual.

PETICIÓN: ${need}

REGLAS:
1. Respeta el tipo de cliente pedido. Si el usuario vende portasueros y pide clínicas en Madrid, busca clínicas/hospitales/centros médicos reales de Madrid. NO busques vendedores de portasueros.
2. Si el tipo de cliente es genérico, usa el producto para concretarlo. Ejemplo: "tiendas" + "muebles de cocina" = tiendas o estudios de cocina.
3. Solo devuelve empresas o negocios reales. Nunca Reddit, Wikipedia, foros, artículos, listados editoriales o resultados genéricos.
4. Cada resultado debe tener al menos una fuente pública concreta. Prioriza la web oficial de la empresa.
5. No inventes nombre, teléfono, email, dirección, web ni actividad. Si un dato no aparece, déjalo vacío.
6. No afirmes que una empresa quiere comprar. Solo explica por qué puede encajar como posible cliente por su actividad.
7. Devuelve entre 1 y 5 resultados correctos. Es mejor menos resultados que inventar.

Devuelve SOLO JSON válido con este formato exacto:
{"interpreted":{"sells":"","clientType":"","zone":"","summary":""},"leads":[{"name":"","activity":"","address":"","phone":"","email":"","website":"","fit":"","evidence":"","sources":[""]}]}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  try {
    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: controller.signal,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        tools: [{ type: "web_search" }],
        input: prompt,
        max_output_tokens: 3600
      })
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`OPENAI_${r.status}:${clean(data?.error?.message || "", 220)}`);
    const parsed = extractJson(responseText(data));
    const leads = (Array.isArray(parsed?.leads) ? parsed.leads : [])
      .map(normalizeLead)
      .filter(plausibleBusiness)
      .slice(0, 5);
    if (!leads.length) throw new Error("OPENAI_NO_REAL_RESULTS");
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

async function fetchText(url, timeout = 7000) {
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
    if (!r.ok) throw new Error(`HTTP_${r.status}`);
    return await r.text();
  } finally {
    clearTimeout(timer);
  }
}

function parseBingRss(xml) {
  const out = [];
  const re = /<item>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = re.exec(xml)) && out.length < 20) {
    const block = m[1];
    const title = decodeXml(block.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || "");
    const link = decodeXml(block.match(/<link>([\s\S]*?)<\/link>/i)?.[1] || "");
    const description = stripHtml(decodeXml(block.match(/<description>([\s\S]*?)<\/description>/i)?.[1] || ""));
    if (title && goodUrl(link)) out.push({ title: clean(title, 180), link: clean(link, 500), description: clean(description, 600) });
  }
  return out;
}

function extractPublicContact(html) {
  const text = stripHtml(html).slice(0, 140000);
  const email = (text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i) || [""])[0];
  const phone = (text.match(/(?:\+34[\s.-]?)?(?:[6789]\d{2})[\s.-]?\d{3}[\s.-]?\d{3}/) || [""])[0];
  const og = html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i)?.[1];
  const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "";
  const name = stripHtml(og || titleTag).split(/[|–—]/)[0].trim();
  return { name: clean(name, 160), email: clean(email, 180), phone: clean(phone, 100), text };
}

function fold(s = "") {
  return String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function words(s = "") {
  const stop = new Set(["para","como","cliente","clientes","empresa","empresas","negocio","negocios","tienda","tiendas","venta","vendo","busco","quiero","madrid","barcelona","espana"]);
  return fold(s).replace(/[^a-z0-9ñ ]/g, " ").split(/\s+/).filter(w => w.length >= 4 && !stop.has(w));
}

function publicQuery(input) {
  const type = clean(input.clientType, 160);
  const zone = clean(input.zone, 160);
  const sells = clean(input.sells, 160);
  if (type && zone) {
    const generic = /^(tiendas?|comercios?|empresas?|negocios?|distribuidores?|mayoristas?)$/i.test(type);
    return generic && sells ? `${type} ${sells} ${zone}` : `${type} ${zone}`;
  }
  return clean(input.request, 260);
}

async function callPublicFallback(input) {
  const q = publicQuery(input);
  if (!q) return null;
  const xml = await fetchText(`https://www.bing.com/search?format=rss&setlang=es&q=${encodeURIComponent(q)}`, 9000);
  const rows = parseBingRss(xml);
  const typeWords = words(input.clientType);
  const zoneWords = words(input.zone);
  const productWords = words(input.sells);
  const generic = /^(tiendas?|comercios?|empresas?|negocios?|distribuidores?|mayoristas?)$/i.test(clean(input.clientType));
  const seen = new Set();
  const leads = [];

  for (const row of rows) {
    let host = "";
    try { host = new URL(row.link).hostname.replace(/^www\./, "").toLowerCase(); } catch {}
    if (!host || seen.has(host)) continue;
    seen.add(host);
    try {
      const html = await fetchText(row.link, 6500);
      const c = extractPublicContact(html);
      const hay = fold(`${row.title} ${row.description} ${c.text.slice(0, 30000)}`);
      const typeOk = !typeWords.length || typeWords.some(w => hay.includes(w.replace(/s$/, "")));
      const zoneOk = !zoneWords.length || zoneWords.some(w => hay.includes(w));
      const productOk = !generic || !productWords.length || productWords.some(w => hay.includes(w.replace(/s$/, "")));
      if (!typeOk || !zoneOk || !productOk) continue;
      let website = row.link;
      try { website = new URL(row.link).origin + "/"; } catch {}
      const lead = normalizeLead({
        name: c.name || row.title,
        activity: input.clientType || "Posible cliente",
        address: "",
        phone: c.phone,
        email: c.email,
        website,
        fit: input.sells ? `Por su actividad pública encaja con el tipo de cliente buscado y podría necesitar ${input.sells}.` : "Su actividad pública encaja con el tipo de cliente buscado.",
        evidence: row.description,
        sources: [website]
      });
      if (!plausibleBusiness(lead)) continue;
      leads.push(lead);
      if (leads.length >= 5) break;
    } catch {}
  }

  if (!leads.length) return null;
  return {
    interpreted: {
      sells: clean(input.sells, 180),
      clientType: clean(input.clientType, 180),
      zone: clean(input.zone, 180),
      summary: clean(userNeed(input), 420)
    },
    leads,
    provider: "public-web-search"
  };
}

async function findProspects(input) {
  const errors = [];
  for (const [name, fn] of [["openai", callOpenAI], ["public", callPublicFallback]]) {
    try {
      const result = await fn(input);
      if (result?.leads?.length) return result;
    } catch (e) {
      errors.push(`${name}:${String(e?.message || e)}`);
      console.error("prospect-search-provider", name, e);
    }
  }
  throw new Error(errors.join(" | ") || "NO_RESULTS");
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
      error: "La búsqueda no ha podido obtener resultados fiables ahora mismo. No vamos a inventarlos. Prueba de nuevo en unos segundos o concreta la zona y el tipo de cliente."
    });
  }
}
