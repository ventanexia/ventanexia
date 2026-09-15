function clean(value, max = 160) {
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
  return {
    name: clean(item?.name, 120),
    activity: clean(item?.activity, 180),
    address: clean(item?.address, 220),
    phone: clean(item?.phone, 120),
    email: clean(item?.email, 160),
    website: clean(item?.website, 220),
    fit: clean(item?.fit, 320),
    sources: Array.isArray(item?.sources)
      ? item.sources.map(x => clean(x, 500)).filter(x => /^https?:\/\//i.test(x)).slice(0, 5)
      : []
  };
}

function prospectPrompt({ sells, clientType, zone }) {
  return `
Eres el motor de prospección comercial de VentaNexIA para España.

OBJETIVO
Encuentra EXACTAMENTE 3 empresas o establecimientos REALES que puedan ser posibles clientes para:
- Producto/servicio que vende el visitante: ${sells}
- Tipo de cliente buscado: ${clientType}
- Población o zona: ${zone}, España

MÉTODO
Investiga en internet público en tiempo real. Cruza varias fuentes cuando sea posible: web oficial, Google-indexed business pages, directorios empresariales públicos, asociaciones sectoriales, páginas de contacto, perfiles públicos de empresa y resultados locales.

REGLAS
1. Los resultados deben corresponder de verdad al tipo de cliente pedido.
2. Deben estar en ${zone} o prestar servicio claramente en esa zona.
3. No uses ejemplos fijos. No reutilices negocios de búsquedas anteriores.
4. No inventes empresas ni datos.
5. Solo muestra teléfono, email, dirección y web si están publicados públicamente para la empresa. Si no aparecen, deja el campo vacío.
6. Prioriza la web oficial como fuente. En sources incluye URLs reales usadas para verificar cada resultado.
7. fit debe explicar brevemente por qué esa empresa puede ser compradora de ${sells}.
8. No incluyas particulares ni datos personales privados.
9. Si una empresa no está suficientemente verificada, descártala y busca otra.
10. Devuelve exactamente 3 resultados cuando existan negocios razonables.

RESPONDE SOLO JSON VÁLIDO, SIN MARKDOWN NI COMENTARIOS, con esta estructura:
{
  "leads": [
    {
      "name":"",
      "activity":"",
      "address":"",
      "phone":"",
      "email":"",
      "website":"",
      "fit":"",
      "sources":["https://..."]
    }
  ]
}
`;
}

async function searchWithOpenAI({ sells, clientType, zone }) {
  const token = String(process.env.OPENAI_API_KEY || "").trim();
  if (!token) throw new Error("OPENAI_NOT_CONFIGURED");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-5.6-sol",
      tools: [{ type: "web_search" }],
      input: prospectPrompt({ sells, clientType, zone }),
      max_output_tokens: 2200,
      store: false
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`OPENAI_${response.status}_${data?.error?.message || "ERROR"}`);

  let text = typeof data?.output_text === "string" ? data.output_text : "";
  if (!text && Array.isArray(data?.output)) {
    for (const item of data.output) {
      if (item?.type !== "message" || !Array.isArray(item?.content)) continue;
      for (const part of item.content) {
        if (part?.type === "output_text" && typeof part?.text === "string") text += part.text;
      }
    }
  }
  if (!text.trim()) throw new Error("OPENAI_EMPTY");
  return text;
}

async function searchWithGateway({ sells, clientType, zone }) {
  const token = String(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN || "").trim();
  if (!token) throw new Error("GATEWAY_NOT_CONFIGURED");

  const models = ["perplexity/sonar-pro", "perplexity/sonar"];
  let lastError;

  for (const model of models) {
    try {
      const response = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: "Eres un investigador comercial B2B riguroso. Usa búsqueda web real y no inventes datos." },
            { role: "user", content: prospectPrompt({ sells, clientType, zone }) }
          ],
          temperature: 0.1,
          max_tokens: 2200
        })
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(`GATEWAY_${model}_${response.status}_${data?.error?.message || "ERROR"}`);
      const text = data?.choices?.[0]?.message?.content;
      if (!text || typeof text !== "string") throw new Error(`GATEWAY_${model}_EMPTY`);
      return text;
    } catch (error) {
      lastError = error;
      console.error("prospect-search gateway", model, error);
    }
  }

  throw lastError || new Error("GATEWAY_FAILED");
}

async function researchProspects(args) {
  const attempts = [];

  if (process.env.OPENAI_API_KEY) attempts.push(searchWithOpenAI);
  attempts.push(searchWithGateway);

  let lastError;
  for (const search of attempts) {
    try {
      const text = await search(args);
      const parsed = extractJson(text);
      const leads = Array.isArray(parsed?.leads)
        ? parsed.leads.map(normalizeLead).filter(x => x.name && (x.website || x.sources.length)).slice(0, 3)
        : [];
      if (leads.length >= 1) return leads;
      lastError = new Error("NO_VERIFIED_LEADS");
    } catch (error) {
      lastError = error;
      console.error("prospect-search provider", error);
    }
  }

  throw lastError || new Error("NO_RESULTS");
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
    const leads = await researchProspects({ sells, clientType, zone });
    return res.status(200).json({
      query: { sells, clientType, zone },
      leads,
      verified: true,
      sourceMode: "multi-provider-live-web"
    });
  } catch (error) {
    console.error("prospect-search final", error);
    return res.status(500).json({
      error: "No hemos podido completar esta búsqueda en este momento. Inténtalo de nuevo en unos segundos.",
      code: "PROSPECT_SEARCH_TEMPORARY_FAILURE"
    });
  }
}
