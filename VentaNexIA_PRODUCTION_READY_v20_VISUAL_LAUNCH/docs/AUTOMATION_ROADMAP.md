# Automatización VentaNexIA — Roadmap

## MVP 1 — Captación y cualificación
- [x] Landing responsive.
- [x] Formulario de diagnóstico.
- [x] Scoring determinista.
- [x] Alta de contacto y negocio en HubSpot.
- [x] Asistente IA web.
- [x] Guardrails básicos.
- [ ] Variables de entorno en Vercel.
- [ ] Despliegue preview.
- [ ] Dominio ventanexia.es.

## MVP 2 — Agenda y seguimiento
- [ ] Reserva de reuniones tras score suficiente.
- [ ] Confirmación de reunión.
- [ ] Recordatorio 24 h / 1 h.
- [ ] Resumen automático previo a reunión.
- [ ] Tarea comercial post-reunión.
- [ ] Seguimiento de propuesta.

## MVP 3 — VNX CORE
- [ ] Memoria comercial por empresa.
- [ ] Base de conocimiento por cliente.
- [ ] Políticas de autonomía configurables.
- [ ] Next Best Action.
- [ ] Opportunity Score histórico.
- [ ] Panel de ROI.
- [ ] Auditoría completa de acciones.

## MVP 4 — Producto comercializable
- [ ] Multiempresa / multitenant.
- [ ] Onboarding guiado.
- [ ] Roles y permisos.
- [ ] Facturación.
- [ ] Plantillas por vertical.
- [ ] Métricas por cliente.

## MVP 2 — Agenda, propuesta y pago (código preparado)
- [x] Reserva mostrada solo a leads cualificados cuando BOOKING_URL está configurada.
- [x] Webhook de reunión: booked / completed / no_show / cancelled.
- [x] Briefing IA previo a reunión.
- [x] Borrador IA de seguimiento post-reunión.
- [x] Eventos de propuesta: enviada / aceptada / revisión / rechazo final.
- [x] Checkout Stripe privado tras propuesta aceptada.
- [x] Webhook Stripe firmado.
- [x] Pago confirmado -> HubSpot Ganado.
- [x] Disparo de onboarding vía webhook de orquestación cuando n8n esté conectado.
- [ ] Configurar credenciales reales y URLs de producción.
- [ ] Validar flujo end-to-end con un pago de prueba de Stripe.

## VNX Provision — pago a instalación
- [x] La solicitud del constructor puede tener `solutionRequestId`.
- [x] Checkout Stripe puede transportar `solution_request_id` en metadata.
- [x] Pago confirmado puede iniciar automáticamente el tenant en estado `provisioning`.
- [x] Se crean 12 agentes por tenant.
- [x] Se infieren conexiones necesarias desde el blueprint.
- [x] Se crean trabajos de knowledge onboarding, configuración, conexiones e instalación.
- [x] Se genera manifiesto de instalación y estrategia de rollback.
- [x] La producción permanece en `waiting_authorization`.
- [x] Guardian crea una aprobación `production_install`.
- [ ] OAuth/credenciales por proveedor: conectar cada cliente una sola vez.
- [ ] Ejecutores por proveedor (CRM, correo, calendario, social, web, analytics).
- [ ] Test automático end-to-end por tenant antes de activar.
