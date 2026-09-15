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

function decodeEntities(s = "") {
  return String(s)
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function safeUrl(raw) {
  try {
    const u = new URL(raw);
    if (!/^https?:$/.test(u.protocol)) return "";
    u.hash = "";
    return u.toString();
  } catch { return ""; }
}

const BLOCKED_HOSTS = [
  "google.", "bing.com", "duckduckgo.com", "facebook.com", "instagram.com", "linkedin.com",
  "youtube.com", "x.com", "twitter.com", "pinterest.", "tripadvisor.", "yelp.",
  "paginasamarillas.es", "empresite.eleconomista.es", "einforma.com", "axesor.es", "infoempresa.com"
];

function looksOfficial(url) {
  try {
    const h = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return !BLOCKED_HOSTS.some(x => h.includes(x));
  } catch { return false; }
}

async function fetchText(url, timeout = 9000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const r = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36",
        "accept-language": "es-ES,es;q=0.9,en;q=0.6"
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

function parseBing(html) {
  const out = [];
  const re = /<li class="b_algo"[\s\S]*?<h2[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/li>/gi;
  let m;
  while ((m = re.exec(html)) && out.length < 12) {
    const url = safeUrl(decodeEntities(m[1]));
    const title = stripHtml(decodeEntities(m[2]));
    if (url && title) out.push({ url, title });
  }
  return out;
}

function parseDuck(html) {
  const out = [];
  const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) && out.length < 12) {
    let href = decodeEntities(m[1]);
    try {
      if (href.includes("uddg=")) {
        const q = new URL(href, "https://duckduckgo.com").searchParams.get("uddg");
        if (q) href = decodeURIComponent(q);
      }
    } catch {}
    const url = safeUrl(href);
    const title = stripHtml(decodeEntities(m[2]));
    if (url && title) out.push({ url, title });
  }
  return out;
}

async function searchWeb(query) {
  const q = encodeURIComponent(query);
  const attempts = [
    async () => parseBing(await fetchText(`https://www.bing.com/search?q=${q}&count=12&setlang=es`)),
    async () => parseDuck(await fetchText(`https://html.duckduckgo.com/html/?q=${q}`))
  ];
  for (const fn of attempts) {
    try {
      const rows = await fn();
      if (rows.length) return rows;
    } catch (e) {
      console.error("search-engine", String(e?.message || e));
    }
  }
  return [];
}

function firstEmail(text) {
  const m = String(text).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (!m) return "";
  const v = m[0].replace(/[),.;:]+$/, "");
  return /example|sentry|wixpress|cloudflare|domain/i.test(v) ? "" : v;
}

function firstPhone(text) {
  const matches = String(text).match(/(?:\+34[\s.-]?)?(?:[6789]\d{2})[\s.-]?\d{3}[\s.-]?\d{3}/g) || [];
  return matches.length ? clean(matches[0], 60) : "";
}

function extractTitle(html, fallback = "") {
  const og = html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i)?.[1];
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  return clean(stripHtml(og || title || fallback).split(/[|–—]/)[0], 120);
}

function extractAddress(text, zone) {
  const z = clean(zone, 80).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`([^.!?]{0,100}(?:C\\/|Calle|Carrer|Avenida|Av\\.|Passeig|Paseo|Plaça|Plaza|Rambla)[^.!?]{0,120}${z}[^.!?]{0,40})`, "i");
  const m = String(text).match(re);
  return m ? clean(m[1], 220) : "";
}

function relevanceScore(text, clientType, zone) {
  const t = String(text).toLowerCase();
  const ct = clean(clientType).toLowerCase().split(/\s+/).filter(x => x.length > 3);
  const z = clean(zone).toLowerCase();
  let score = t.includes(z) ? 4 : 0;
  for (const token of ct) if (t.includes(token)) score += 2;
  return score;
}

async function enrichCandidate(row, clientType, zone, sells) {
  if (!looksOfficial(row.url)) return null;
  let html = "";
  try { html = await fetchText(row.url, 8000); } catch { return null; }
  const text = stripHtml(html).slice(0, 60000);
  const score = relevanceScore(`${row.title} ${text.slice(0, 12000)}`, clientType, zone);
  if (score < 2) return null;

  let email = firstEmail(text);
  let phone = firstPhone(text);
  let address = extractAddress(text, zone);

  if (!email || !phone || !address) {
    try {
      const base = new URL(row.url);
      for (const path of ["/contacto", "/contact", "/es/contacto", "/contacta"]) {
        try {
          const h = await fetchText(new URL(path, base.origin).toString(), 5000);
          const tx = stripHtml(h).slice(0, 30000);
          email ||= firstEmail(tx);
          phone ||= firstPhone(tx);
          address ||= extractAddress(tx, zone);
          if (email && phone && address) break;
        } catch {}
      }
    } catch {}
  }

  let website = row.url;
  try { website = new URL(row.url).origin + "/"; } catch {}

  return {
    name: extractTitle(html, row.title) || clean(row.title, 120),
    activity: clean(clientType, 160),
    address,
    phone,
    email,
    website,
    fit: `Encaja con el tipo de cliente “${clean(clientType, 100)}” en ${clean(zone, 80)} y podría ser un posible comprador de ${clean(sells, 120)}.`,
    sources: [row.url],
    _score: score
  };
}

async function directProspecting({ sells, clientType, zone }) {
  const queries = [
    `\"${clientType}\" \"${zone}\" España`,
    `${clientType} ${zone} contacto`,
    `${clientType} ${zone} ${sells}`
  ];
  const seen = new Set();
  const candidates = [];

  for (const q of queries) {
    const rows = await searchWeb(q);
    for (const row of rows) {
      try {
        const host = new URL(row.url).hostname.toLowerCase().replace(/^www\./, "");
        if (!host || seen.has(host) || !looksOfficial(row.url)) continue;
        seen.add(host);
        candidates.push(row);
      } catch {}
      if (candidates.length >= 10) break;
    }
    if (candidates.length >= 10) break;
  }

  const enriched = [];
  for (const row of candidates.slice(0, 10)) {
    const lead = await enrichCandidate(row, clientType, zone, sells);
    if (lead) enriched.push(lead);
    if (enriched.length >= 5) break;
  }

  enriched.sort((a, b) => b._score - a._score);
  return enriched.slice(0, 3).map(({ _score, ...x }) => x);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });

  const sells = clean(req.body?.sells);
  const clientType = clean(req.body?.clientType);
  const zone = clean(req.body?.zone);
  if (!sells || !clientType || !zone) {
    return res.status(400).json({ error: "Completa qué vendes, tipo de cliente y zona." });
  }

  try {
    const leads = await directProspecting({ sells, clientType, zone });
    if (!leads.length) {
      return res.status(404).json({ error: "No hemos podido verificar tres negocios con esa búsqueda. Prueba indicando el tipo de negocio de forma sencilla, por ejemplo: clínicas, hoteles, herbolarios o tiendas de muebles." });
    }
    return res.status(200).json({
      query: { sells, clientType, zone },
      leads,
      verified: true,
      sourceMode: "multi-engine-direct-web"
    });
  } catch (error) {
    console.error("prospect-search", error);
    return res.status(500).json({ error: "No se pudo completar la búsqueda en este momento. Inténtalo otra vez." });
  }
}
