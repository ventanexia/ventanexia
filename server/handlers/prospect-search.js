import { generateText, stepCountIs } from "ai";
import { gateway } from "@ai-sdk/gateway";

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

OBJETIVO
Busca EN LA WEB exactamente 3 empresas REALES que puedan ser posibles clientes para esta búsqueda:
- Qué vende el visitante: ${sells}
- Tipo de cliente que busca: ${clientType}
- Zona: ${zone}

REGLAS OBLIGATORIAS
1. Debes usar la herramienta de búsqueda web antes de responder.
2. Los 3 resultados deben corresponder al tipo de cliente solicitado y estar en la zona indicada, o atender claramente esa zona.
3. No reutilices ejemplos fijos ni inventes empresas.
4. Usa solo datos empresariales publicados públicamente por la propia empresa o fuentes públicas fiables.
5. No inventes email, teléfono, dirección ni web. Si un dato no aparece publicado, devuelve cadena vacía para ese campo.
6. Prioriza la web oficial de cada empresa. Añade las URLs de las fuentes verificadas.
7. Explica en una frase por qué cada empresa encaja como posible comprador de lo que vende el visitante.
8. No incluyas particulares ni datos personales no publicados como contacto empresarial.
9. Devuelve SOLO JSON válido, sin markdown ni texto adicional, con esta forma exacta:
{
  "query": {"sells":"...","clientType":"...","zone":"..."},
  "leads": [
    {
      "name":"...",
      "activity":"...",
      "address":"...",
      "phone":"...",
      "email":"...",
      "website":"...",
      "fit":"...",
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
        web_search: gateway.tools.takoSearch()
      },
      toolChoice: "required",
      stopWhen: stepCountIs(5)
    });

    const parsed = extractJson(result.text);
    const leads = Array.isArray(parsed?.leads) ? parsed.leads.map(normalizeLead).filter(x => x.name).slice(0, 3) : [];
    if (!leads.length) return res.status(502).json({ error: "No se pudieron verificar resultados para esa búsqueda." });

    return res.status(200).json({
      query: { sells, clientType, zone },
      leads,
      verified: true
    });
  } catch (error) {
    console.error("prospect-search", error);
    return res.status(500).json({ error: "No se pudo completar la búsqueda ahora mismo. Inténtalo de nuevo." });
  }
}
