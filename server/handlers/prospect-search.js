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

function normalizeLead(item) {
  const sources = Array.isArray(item?.sources)
    ? item.sources.map(x => clean(x, 500)).filter(x => /^https?:\/\//i.test(x)).slice(0, 5)
    : [];
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

async function callOpenAI({ request, sells, clientType, zone }) {
  const key = String(process.env.OPENAI_API_KEY || "").trim();
  if (!key) return null;

  const userNeed = request || [
    sells ? `Vendo: ${sells}` : "",
    clientType ? `Quiero encontrar como posibles clientes: ${clientType}` : "",
    zone ? `Zona: ${zone}, España` : ""
  ].filter(Boolean).join(". ");

  const prompt = `Eres el motor de prospección comercial de VentaNexIA. Debes entender lo que pide el visitante aunque lo escriba de forma coloquial, con errores o sin usar términos técnicos.

PETICIÓN DEL VISITANTE
${userNeed}

OBJETIVO
Encontrar exactamente 3 empresas o establecimientos REALES que puedan ser clientes potenciales para lo que pide.

MÉTODO OBLIGATORIO
1. Interpreta la intención comercial: qué vende/ofrece, qué tipo de comprador busca, zona y restricciones.
2. Usa búsqueda web en tiempo real. Haz las búsquedas necesarias, con sinónimos y variantes si hace falta.
3. Busca COMPRADORES potenciales, no competidores ni empresas que vendan lo mismo salvo que el visitante lo pida expresamente.
4. Verifica cada empresa con su web oficial y/o fuentes públicas fiables.
5. Solo usa datos empresariales públicos. Nunca inventes nombre, dirección, teléfono, email, web ni datos de contacto. Si un dato no está publicado, déjalo vacío.
6. Prioriza empresas que realmente encajen con la necesidad del visitante.
7. En fit explica de forma concreta por qué esa empresa puede ser un buen cliente potencial.
8. En sources incluye las URLs reales consultadas para cada empresa.
9. Si el visitante pide una población española, los resultados deben estar en esa población o atender claramente esa zona.

DEVUELVE SOLO JSON VÁLIDO, SIN MARKDOWN, con esta forma:
{
  "interpreted": {
    "sells": "qué vende/ofrece el visitante",
    "clientType": "tipo de comprador interpretado",
    "zone": "zona interpretada",
    "summary": "qué ha entendido la IA"
  },
  "leads": [
    {"name":"","activity":"","address":"","phone":"","email":"","website":"","fit":"","sources":["https://..."]}
  ]
}
`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  try {
    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-5.6-terra",
        tools: [{ type: "web_search" }],
        tool_choice: "auto",
        input: prompt,
        max_output_tokens: 4200
      })
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`OPENAI_${r.status}:${clean(data?.error?.message || "", 240)}`);
    const parsed = extractJson(responseText(data));
    const leads = Array.isArray(parsed?.leads) ? parsed.leads.map(normalizeLead).filter(x => x.name).slice(0, 3) : [];
    if (!leads.length) throw new Error("OPENAI_NO_RESULTS");
    return {
      interpreted: {
        sells: clean(parsed?.interpreted?.sells || sells, 180),
        clientType: clean(parsed?.interpreted?.clientType || clientType, 180),
        zone: clean(parsed?.interpreted?.zone || zone, 180),
        summary: clean(parsed?.interpreted?.summary || userNeed, 420)
      },
      leads,
      provider: "openai-web-search"
    };
  } finally {
    clearTimeout(timer);
  }
}

async function callSonar({ request, sells, clientType, zone }) {
  const key = String(process.env.AI_GATEWAY_API_KEY || "").trim();
  if (!key) return null;
  const userNeed = request || `${sells}. Posibles clientes: ${clientType}. Zona: ${zone}, España.`;
  const prompt = `Interpreta esta petición comercial y busca EN LA WEB exactamente 3 compradores potenciales reales: ${userNeed}\nNo inventes datos. Devuelve SOLO JSON con interpreted{sells,clientType,zone,summary} y leads[{name,activity,address,phone,email,website,fit,sources}].`;
  const r = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "perplexity/sonar-pro",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      max_tokens: 3000
    })
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`SONAR_${r.status}`);
  const content = data?.choices?.[0]?.message?.content || "";
  const parsed = extractJson(content);
  const leads = Array.isArray(parsed?.leads) ? parsed.leads.map(normalizeLead).filter(x => x.name).slice(0, 3) : [];
  if (!leads.length) throw new Error("SONAR_NO_RESULTS");
  return {
    interpreted: {
      sells: clean(parsed?.interpreted?.sells || sells, 180),
      clientType: clean(parsed?.interpreted?.clientType || clientType, 180),
      zone: clean(parsed?.interpreted?.zone || zone, 180),
      summary: clean(parsed?.interpreted?.summary || userNeed, 420)
    },
    leads,
    provider: "sonar-web-search"
  };
}

async function callGooglePlaces({ sells, clientType, zone }) {
  const key = String(process.env.GOOGLE_PLACES_API_KEY || "").trim();
  if (!key || !clientType || !zone) return null;
  const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.googleMapsUri"
    },
    body: JSON.stringify({ textQuery: `${clientType} en ${zone}, España`, languageCode: "es", regionCode: "ES", pageSize: 6 })
  });
  if (!r.ok) throw new Error(`GOOGLE_PLACES_${r.status}`);
  const data = await r.json();
  const leads = (data?.places || []).slice(0, 3).map(p => normalizeLead({
    name: p?.displayName?.text,
    activity: clientType,
    address: p?.formattedAddress,
    phone: p?.nationalPhoneNumber,
    email: "",
    website: p?.websiteUri,
    fit: `Por su actividad en ${zone}, puede ser un posible comprador de ${sells || "lo que ofrece el visitante"}.`,
    sources: [p?.websiteUri || p?.googleMapsUri].filter(Boolean)
  })).filter(x => x.name);
  if (!leads.length) return null;
  return {
    interpreted: { sells: clean(sells), clientType: clean(clientType), zone: clean(zone), summary: `${clientType} en ${zone}` },
    leads,
    provider: "google-places"
  };
}

async function findProspects(input) {
  const errors = [];
  for (const [name, fn] of [
    ["openai", callOpenAI],
    ["sonar", callSonar],
    ["google", callGooglePlaces]
  ]) {
    try {
      const result = await fn(input);
      if (result?.leads?.length) return result;
    } catch (e) {
      errors.push(`${name}:${String(e?.message || e)}`);
      console.error("prospect-search-provider", name, e);
    }
  }
  throw new Error(errors.join(" | ") || "NO_SEARCH_PROVIDER_RESULTS");
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
      sourceMode: result.provider
    });
  } catch (error) {
    console.error("prospect-search", error);
    return res.status(502).json({ error: "El buscador de IA no ha podido completar esta búsqueda. Inténtalo de nuevo en unos segundos." });
  }
}
