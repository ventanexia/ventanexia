# VNX Provisioning Engine

## State machine
REQUESTED -> BLUEPRINT_READY -> DIAGNOSTIC -> PROPOSAL -> ACCEPTED -> PAID -> PROVISIONING -> CONNECTIONS_READY -> TESTING -> GUARDIAN_APPROVAL -> ACTIVE.

## What is automatic
After confirmed payment, VNX can:
1. create an isolated tenant;
2. create the tenant's agent set;
3. derive required connectors from the approved blueprint;
4. queue knowledge, configuration and installation jobs;
5. create an installation manifest and rollback plan;
6. request only the authorizations that cannot legally/technically be delegated;
7. test connected workflows;
8. ask Guardian for final production approval;
9. activate and monitor.

## What cannot be silently automated
Third-party OAuth consent, 2FA, bank verification, domain ownership challenges, app-store/business verification and other provider-controlled steps require the authorized account holder. VNX should present a one-click/short authorization step, then continue itself.

## Principle
The customer authorizes access; VNX operates the connected systems. The customer never provides raw passwords to VentaNexIA.
