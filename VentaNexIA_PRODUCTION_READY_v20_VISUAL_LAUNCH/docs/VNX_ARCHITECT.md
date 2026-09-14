# VNX Architect — autonomous solution intake

## Goal
A prospect can describe in natural language what they want VentaNexIA to automate. The website generates an initial structured blueprint instead of forcing them to choose software modules.

## Public flow
1. Prospect submits company, role, email, current tools and desired outcome.
2. VNX Architect creates a conservative blueprint:
   - goals
   - modules
   - VNX agents
   - required integrations
   - automations
   - data required
   - approvals required
   - complexity
   - next step
3. The request is stored in `vnx_solution_requests` when Supabase is configured.
4. An orchestration event `solution.blueprint_ready` is emitted when n8n is configured.
5. The request can enter diagnostic/proposal workflow.
6. Production activation remains blocked behind VNX Guardian approval.

## Safety / governance
- No secrets or credentials are requested in the public form.
- No client production systems are changed from the public request.
- No price, deadline, result or integration state is invented.
- Arbitrary instructions in the prospect request cannot override VNX Architect policy.
- Actual installation is performed only after authenticated onboarding, commercial acceptance and Guardian approval.

## Long-term target
Once tenant credentials and connectors are authorized, VNX Provision should materialize the approved blueprint into tenant-specific agents, workflows, CRM rules, knowledge base, scheduling, billing and monitoring.

## Custom module generation
If a requirement is not covered by a standard capability, VNX Builder creates a tenant-specific module manifest. Provision maps it to available executors; unsupported pieces are flagged for connector/module development before activation.
