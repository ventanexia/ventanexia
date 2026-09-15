import { generateText, gateway } from "ai";

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
    fit: clean(item?.fit, 260),
    sources: Array.isArray(item?.sources)
      ? item.sources.map(x => clean(x, 350)).filter(x => /^https?:\/\//i.test(x)).slice(0, 3)
      : []
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });

  const sells = clean(req.body?.sells);
  const clientType = clean(req.body?.clientType);
  const zone = clean(req.body?.zone);

  if (!sells || !clientType || !zone) {
    return res.status(400).json({ error: "Completa qué vendes, tipo de cliente y zona." });
  }

  const prompt = `
Actúa como investigador comercial B2B de VentaNexIA.

Busca en la web exactamente 3 empresas REALES que puedan ser posibles clientes para:
- Producto o servicio que vende el visitante: ${sells}
- Tipo de cliente solicitado: ${clientType}
- Zona: ${zone}

Reglas:
- Haz una búsqueda web real antes de responder.
- Los resultados deben ser empresas reales del tipo solicitado y de la zona indicada, o que operen claramente en ella.
- No uses ejemplos fijos y no inventes empresas.
- Usa solo datos empresariales públicos.
- No inventes email, teléfono, dirección ni web. Si no encuentras un dato, deja ese campo vacío.
- Prioriza la web oficial y añade las URLs usadas en sources.
- Explica en una frase por qué cada empresa encaja como posible comprador.
- Devuelve SOLO JSON válido con esta estructura:
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

  try {
    const result = await generateText({
      model: "openai/gpt-5.6-sol",
      prompt,
      tools: {
        tako_search: gateway.tools.takoSearch()
      }
    });

    const parsed = extractJson(result.text);
    const leads = Array.isArray(parsed?.leads)
      ? parsed.leads.map(normalizeLead).filter(x => x.name).slice(0, 3)
      : [];

    if (leads.length < 1) {
      return res.status(502).json({ error: "No se pudieron verificar resultados para esa búsqueda." });
    }

    return res.status(200).json({
      query: { sells, clientType, zone },
      leads,
      verified: true
    });
  } catch (error) {
    console.error("prospect-search", error);
    return res.status(500).json({
      error: "No se pudo completar la búsqueda ahora mismo. Inténtalo de nuevo.",
      detail: process.env.NODE_ENV === "development" ? String(error?.message || error) : undefined
    });
  }
}
