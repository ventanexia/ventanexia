# VentaNexIA V21 — Operational hardening

V21 keeps the V20 public experience and adds launch controls required before enabling autonomous production actions.

## Added in V21

- Signed trial activation token (`TRIAL_SIGNING_SECRET`): a 72-hour demo can only be started from the solution request that generated it.
- Central execution gateway (`lib/execution-gateway.js`): entitlement check, Guardian-sensitive-action check, tenant policy lookup, idempotency, optional monthly technical budget, execution audit and usage recording.
- Social publishing now goes through the execution gateway in both direct publish and scheduled sweep paths.
- Stripe webhook idempotency via `vnx_webhook_events`; duplicate events are acknowledged without replaying side effects.
- Stripe `customer.subscription.updated` handling for active/reactivated, past-due/unpaid/paused and cancelled states.
- Reactivation checkout for previously paid suspended clients without charging the implementation fee again.
- Suspended client portal becomes read-only while preserving configuration and data.
- Secure onboarding profile: company context, brand voice, knowledge URLs, desired channels and commercial rules. It never asks for credentials.
- Monthly usage counters (`vnx_usage_monthly`) and optional per-plan technical action budgets via environment variables.
- Health endpoint now reports launch readiness without exposing secret values.
- Portal/API cache hardening and ESM runtime declaration.

## Required database migration

Apply `supabase/migrations/009_operational_hardening.sql` after migrations 001–008.

## Required environment variables for full launch

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `HUBSPOT_ACCESS_TOKEN`
- `OPENAI_API_KEY`
- `OPENAI_MODEL=gpt-5.6-terra` (or another approved model)
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- all active Stripe price IDs
- `AUTOMATION_WEBHOOK_SECRET`
- `N8N_AUTOMATION_WEBHOOK`
- `PORTAL_SESSION_SECRET`
- `TRIAL_ABUSE_SECRET`
- `TRIAL_SIGNING_SECRET` (32+ random characters)
- `CRON_SECRET`
- `PUBLIC_APP_URL=https://www.ventanexia.es`

Optional technical action budgets remain blank until commercial fair-use limits are approved.

## Production activation rule

V21 still does not bypass OAuth, provider permissions, 2FA, legal restrictions, API limits or Guardian approvals. Sensitive or irreversible actions remain approval-controlled.
