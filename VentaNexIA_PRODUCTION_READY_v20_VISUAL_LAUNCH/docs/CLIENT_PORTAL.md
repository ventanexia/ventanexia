# VentaNexIA Client Portal

## Goal
The customer should manage outcomes, not infrastructure.

## Secure login
The portal uses one-time magic links. Login tokens are hashed in the database, expire after 20 minutes and are single use. Successful login creates an HttpOnly SameSite session cookie.

## Client surfaces
- licence/trial state and countdown;
- current plan;
- active agents;
- integration state;
- Guardian approvals needing attention;
- Social Autopilot calendar;
- recent change requests;
- billing portal;
- natural-language request box for new automations.

## Continuous customization
A paid customer can request a new outcome in natural language. VNX Change Architect generates an incremental blueprint and computes possible plan impact. The request enters the provisioning queue; it does not silently bypass permissions or billing constraints.

## Billing principle
New functionality covered by the current plan can be queued normally. If agent/integration/complexity requirements exceed the plan, the portal surfaces the suggested upgrade instead of silently creating unpriced recurring cost.
