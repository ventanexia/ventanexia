# VentaNexIA — Extensible autonomy

## Product principle
Each tenant may have a different commercial operating system. The platform is not limited to a fixed list of automations.

## How customization works
1. A business requirement is translated to capabilities.
2. VNX Builder composes or generates a tenant module manifest.
3. The manifest declares triggers, actions, integrations, policies and rollback.
4. VNX Provision resolves each action to an executor/connector.
5. The module runs in an isolated tenant context.
6. VNX Guardian evaluates every high-impact action against tenant policy.
7. Low-risk allowed actions can execute autonomously.
8. Unsupported capabilities are surfaced as a connector/module gap, not silently invented.

## Maximum autonomy, not uncontrolled autonomy
The system can be highly autonomous after authorization, but it cannot bypass:
- third-party OAuth and account permissions;
- legal/contractual requirements;
- security boundaries and data-access scopes;
- provider API limits;
- actions expressly denied by the tenant/owner.

## Custom software
A tenant module can implement:
- CRM workflows;
- lead generation and enrichment;
- email and inbox automation;
- scheduling;
- content and SEO;
- social publishing;
- document/proposal workflows;
- billing events;
- custom APIs and webhooks;
- reporting and analytics;
- onboarding and customer-success operations.

New executors can be registered without redesigning the whole platform.
