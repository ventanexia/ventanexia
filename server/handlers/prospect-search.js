import { generateText } from "ai";

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
      ? item.sources.map(x => clean(x, 350)).filter(x => /^https?:\/\//i.test(x)).slice(0, 4)
      : []
  };
}

async function researchProspects({ sells, clientType, zone }) {
  const prompt = `
Eres un investigador comercial B2B en España con acceso a búsqueda web en tiempo real.

TAREA
Encuentra exactamente 3 empresas o establecimientos REALES que puedan ser posibles clientes para esta búsqueda:
- Qué vende el visitante: ${sells}
- Tipo de cliente que busca: ${clientType}
- Población o zona: ${zone}, España

BUSCA DE VERDAD EN INTERNET
Consulta webs oficiales, directorios empresariales públicos, resultados locales, páginas corporativas y perfiles públicos indexados. No inventes datos ni reutilices ejemplos fijos.

CRITERIOS
1. Los resultados deben corresponder al tipo de cliente solicitado.
2. Deben estar en ${zone} o atender claramente esa población/zona.
3. Prioriza negocios con web oficial o presencia pública verificable.
4. Solo usa datos empresariales publicados públicamente.
5. No inventes email, teléfono, dirección ni web. Si un dato no aparece, usa "".
6. En sources incluye URLs reales donde hayas verificado el negocio.
7. fit debe explicar en una sola frase por qué podría comprar ${sells}.
8. No incluyas particulares ni datos personales privados.
9. Devuelve exactamente 3 resultados siempre que existan negocios razonables en esa zona.

DEVUELVE SOLO JSON VÁLIDO, SIN MARKDOWN, con esta estructura exacta:
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

  const models = ["perplexity/sonar-pro", "perplexity/sonar"];
  let lastError;

  for (const model of models) {
    try {
      const result = await generateText({
        model,
        prompt,
        maxOutputTokens: 2200
      });
      const parsed = extractJson(result.text);
      const leads = Array.isArray(parsed?.leads)
        ? parsed.leads.map(normalizeLead).filter(x => x.name).slice(0, 3)
        : [];
      if (leads.length >= 3) return leads;
      if (leads.length > 0) return leads;
    } catch (error) {
      lastError = error;
      console.error(`prospect-search ${model}`, error);
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
    if (!leads.length) {
      return res.status(404).json({ error: "No encontramos empresas verificables para esa búsqueda. Prueba con un tipo de cliente más amplio." });
    }

    return res.status(200).json({
      query: { sells, clientType, zone },
      leads,
      verified: true,
      sourceMode: "live-web-search"
    });
  } catch (error) {
    console.error("prospect-search", error);
    return res.status(500).json({
      error: "La búsqueda web no respondió correctamente. Estamos usando una ruta alternativa de búsqueda y puedes volver a intentarlo en unos segundos."
    });
  }
}
