VENTANEXIA WEB v2 — PREPARADA PARA DESPLIEGUE
================================================

Estado
- Front-end completo y responsive.
- Sin dependencias externas.
- Sin analítica ni tracking activados.
- Demo de agente y scoring 100% local.
- Calculadora ROI local.
- Formulario que abre un email a demo@ventanexia.es.
- Aviso legal / privacidad / cookies incluidos como BORRADORES.

Antes de publicar
1. Verificar CIF, domicilio social y datos registrales de ECOJAFER S.L.
2. Sustituir los placeholders legales y retirar el aviso "BORRADOR INTERNO".
3. Conectar formulario a backend/CRM.
4. Conectar agente real VNX CORE.
5. Conectar agenda.
6. Validar SPF/DKIM/DMARC final.
7. Añadir analítica solo después de configurar CMP/consentimiento si corresponde.
8. Conectar dominio ventanexia.es al hosting/plataforma elegida.

Archivos
- index.html
- aviso-legal.html
- privacidad.html
- cookies.html
- assets/styles.css
- assets/app.js

Diseño de producto
La web presenta VentaNexIA como sistema comercial autónomo, no como chatbot.
Incluye VNX Guardian, niveles de autonomía, Opportunity Score y Next Best Action.

Nota
No publicar los textos legales tal como están sin completar los datos societarios verificados.


Archivos técnicos añadidos
- assets/hubspot-config.example.json: mapeo del portal/pipeline HubSpot sin secretos.
- assets/vnx-core-policy.json: scoring, guardrails y reglas de transición de VNX CORE.

Seguridad
Estos JSON no contienen contraseñas, tokens ni secretos. Las credenciales reales deben almacenarse en variables/secret vault.
