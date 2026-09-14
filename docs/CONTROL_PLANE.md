# VNX Control — arquitectura de autonomía multiempresa

## Objetivo
VentaNexIA opera como control plane. Cada cliente nuevo se da de alta como `tenant`, recibe su propio conjunto de agentes, políticas, trabajos de provisionamiento y cola de aprobaciones.

## Regla de gobierno
El sistema ejecuta automáticamente todo lo que esté dentro de política. Las acciones sensibles entran en `vnx_approvals`.
El administrador autoriza o rechaza desde `/control.html`.

### Automático por defecto
- investigación de cuentas en fuentes permitidas;
- enriquecimiento empresarial;
- scoring y priorización;
- borradores de email, propuesta, SEO y social;
- respuestas de bajo riesgo basadas en conocimiento aprobado;
- actualización normal de CRM;
- recordatorios y tareas;
- reporting y recomendaciones.

### Aprobación obligatoria
- activar un cliente en producción;
- escritura/rotación de credenciales;
- primer lanzamiento outbound o cambios fuertes de volumen;
- cambios de precio/descuento;
- envío de una propuesta contractual;
- reclamaciones, contenido legal/sensible;
- publicar por primera vez en un canal nuevo;
- borrado masivo de datos;
- acciones irreversibles o de alto impacto.

## Alta de cliente
1. Crear tenant en VNX Control.
2. Crear 12 agentes y políticas.
3. Generar `public_key`.
4. Preparar trabajos de CRM, calendario, email y widget.
5. Guardian solicita aprobación para activación.
6. Una vez autorizada, VNX Provision ejecuta los conectores disponibles.
7. El sitio del cliente puede instalar el widget mediante una sola etiqueta `<script>`.

## Instalador web
`/assets/vnx-client.js` es el componente embebible inicial.
No contiene secretos. Usa solo la `public_key` del tenant.
Los datos entrantes terminan en `vnx_client_leads`, generando un trabajo de cualificación.

## Persistencia
Supabase/PostgreSQL:
- vnx_tenants
- vnx_agents
- vnx_approvals
- vnx_jobs
- vnx_events
- vnx_client_leads

La clave `SUPABASE_SERVICE_ROLE_KEY` es exclusivamente server-side.
RLS está activado y no existen políticas para clientes anónimos.

## Futuras extensiones
- autenticación robusta con Supabase Auth;
- knowledge base vectorial por tenant;
- provisioning de n8n workflows por tenant;
- conectores CRM/email/calendario/social por tenant;
- facturación y límites por plan;
- dashboard ROI multiempresa;
- secretos en vault, no en tablas.

## VNX Architect intake
Public solution requests enter `vnx_solution_requests`. Qualified requests can be promoted into a tenant provisioning workflow after diagnosis/acceptance. Public requests never activate production directly.
