# VentaNexIA — Pagos y automatización de cierre

## Principio
VentaNexIA no solicita ni almacena datos bancarios o de tarjeta en su frontend.
La cuenta bancaria receptora se configura directamente en Stripe.
Las claves de Stripe viven solo en variables seguras del servidor.

## Flujo objetivo
1. Propuesta enviada -> HubSpot: Propuesta enviada.
2. Propuesta aceptada -> HubSpot: Negociación.
3. VNX crea un Checkout privado de Stripe usando Price IDs preaprobados.
4. Cliente paga en Stripe.
5. Webhook firmado de Stripe confirma el pago.
6. HubSpot -> Ganado.
7. VNX dispara onboarding/provisionamiento vía n8n cuando esté conectado.
8. Renovaciones/cancelaciones generan eventos operativos sin cambiar la venta histórica.

## Endpoints
- POST /api/proposal-event
  - sent
  - accepted
  - revision_requested
  - rejected_final
- POST /api/create-checkout
  - uso interno; genera checkout sin aceptar importes del navegador.
- POST /api/stripe-webhook
  - webhook firmado; no requiere clave de automatización.
- POST /api/meeting-event
  - booked / completed / no_show / cancelled.
  - puede generar briefing o borrador de seguimiento con IA.
- GET /api/health
  - solo expone si las integraciones están configuradas; nunca secretos.

## Guardrails
- No se aceptan importes libres desde el navegador.
- El precio se define mediante STRIPE_PRICE_* preconfigurados.
- El score comercial no se muestra al visitante.
- Pago no equivale a permiso para envíos comerciales masivos.
- Cancelar una suscripción no convierte una venta histórica en "Perdida".
- El envío automático de follow-ups debe activarse tras validar plantillas y entregabilidad.

## Stripe test catalog
- Implantación inicial (PRUEBA): `price_1UFbzYBqvWaQiejVvXH75a3l` — 1,00 EUR pago único.
- Suscripción mensual (PRUEBA): `price_1UFbxwBqvWaQiejVzbjstmnz` — 1,00 EUR/mes.
- Estos IDs son solo del entorno de prueba y no deben reutilizarse en producción.

## Banking data policy
- Payout bank details are configured only inside the verified Stripe account.
- IBAN/account numbers are never committed to source code, `.env.example`, CRM notes, Drive documentation or analytics.
- The application stores Stripe object IDs and payment state, not raw banking credentials.
