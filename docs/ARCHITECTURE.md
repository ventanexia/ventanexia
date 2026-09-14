# VentaNexIA — Arquitectura MVP

## Objetivo
Convertir una visita web en una oportunidad comercial trazable, cualificada y accionable, con supervisión humana.

## Flujo de producción
1. **Web pública**
   - Home premium.
   - VNX AI visible y transparente.
   - Formulario de diagnóstico.
2. **VNX Gateway (Vercel Functions)**
   - `/api/chat`: conversación comercial con OpenAI Responses API.
   - `/api/qualify`: scoring determinista 0–100.
   - `/api/lead`: deduplicación y alta en HubSpot.
   - `/api/health`: estado de configuración.
3. **HubSpot**
   - Contacto = persona.
   - Negocio = oportunidad real.
   - Pipeline `VentaNexIA · Pipeline Comercial`.
4. **VNX Guardian**
   - Nunca inventa precios ni descuentos.
   - No compromete condiciones jurídicas.
   - Respeta DO_NOT_CONTACT.
   - Escala al humano ante baja confianza o acción sensible.
5. **Agenda**
   - Fase siguiente: reserva automática tras cualificación.
6. **Seguimiento**
   - Fase siguiente: n8n / HubSpot workflows para cadencias y recordatorios.

## Variables de entorno
- `HUBSPOT_ACCESS_TOKEN`
- `OPENAI_API_KEY`
- `OPENAI_MODEL` (opcional, por defecto `gpt-5`)

Nunca almacenar secretos en HTML, JavaScript de navegador o repositorio público.

## Regla de creación de oportunidades
- Todo formulario válido crea o actualiza el contacto en HubSpot.
- Score < 70: NO crea negocio; permanece como lead para nurturing/validación.
- Score 70–84: crea oportunidad en `Oportunidad cualificada`.
- Score 85–100: crea oportunidad en `Prioridad alta`.
- Si ya existe una oportunidad abierta con el mismo nombre y pipeline, se actualiza prioridad/siguiente paso en vez de duplicarla.
- El ticket medio declarado por el prospecto NO se usa como importe del negocio.
- El score es interno y no se muestra al visitante.
## Conversión web V4
- Calculadora de fuga comercial basada únicamente en inputs del usuario; no se presenta como predicción.
- UTM/source URL capturados y guardados en la descripción de la oportunidad.
- Correlation ID por solicitud para trazabilidad en logs.
- Los leads cualificados pueden recibir un BOOKING_URL público tras el registro CRM.
- No se muestran scores internos al visitante.
- La web evita testimonios, logos de clientes y porcentajes de resultado no verificados.
