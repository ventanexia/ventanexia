# VentaNexIA — Trial and entitlements

## Commercial lifecycle
BLUEPRINT -> TRIAL (72h) -> PAID/ACTIVE or SUSPENDED.

## Trial
- Duration: exactly 3 x 24 hours from activation.
- No card required to start.
- The tenant is personalized from the prospect blueprint.
- Trial is deliberately constrained:
  - no bulk outbound;
  - no high-impact writes to connected production systems;
  - no contractual or financial commitments;
  - no irreversible actions.
- Every protected action checks the entitlement in the backend.

## Expiry
At `trial_ends_at`, access becomes invalid by calculation even if a sweep job has not yet run.
`trial-sweep` marks expired tenants as suspended and disables agents.
Data/configuration are retained; deletion is not used as a payment enforcement mechanism.

## Paid activation
Checkout contains the tenant/solution identity in metadata.
`checkout.session.completed` / `invoice.paid` activates the entitlement and re-enables agents.

## Non-payment
`invoice.payment_failed` suspends the tenant.
A later successful `invoice.paid` reactivates it automatically.
`customer.subscription.deleted` suspends access as cancelled.

## Economics
The subscription should define included capability/usage boundaries. Functional customization can be broad, but external API, AI, messaging, enrichment, storage and other variable costs must be metered or subject to fair-use/overage policy so a single tenant cannot create unlimited unpriced cost.
