# VentaNexIA — Capability Review v18

## Core principle
The product should answer business outcomes, not force clients to buy isolated features. VNX Architect translates a request into capabilities, agents, integrations, policies and a tenant-specific module.

## Capability families reviewed
1. Sales: prospecting, enrichment, qualification, CRM, pipeline, follow-up, scheduling, proposals.
2. Marketing: SEO, blogs, landing pages, email campaigns, campaign analysis.
3. Social Autopilot: strategy, brand voice, calendar, generation, channel adaptation, scheduling, publishing, analytics, comment/DM triage.
4. Communications: inbox, webchat, WhatsApp/SMS where authorized, reminders and sequences.
5. Customer operations: onboarding, support triage, knowledge base, renewals, NPS/review workflows.
6. Commerce: checkout, subscriptions, payment state, customer portal, invoicing events.
7. Operations: documents, data sync, scheduled reports, alerts, APIs/webhooks, custom workflows.
8. Custom software: new tenant modules when a standard capability is insufficient.

## Social Autopilot state machine
STRATEGY -> DRAFT -> APPROVAL_REQUIRED/AUTONOMOUS -> SCHEDULED -> PUBLISHING -> PUBLISHED -> ANALYZED -> NEXT_CYCLE.

## Social guardrails
- Brand profile and forbidden topics are tenant-specific.
- No invented metrics/testimonials/claims.
- New social channel activation requires account authorization.
- Default first publication on a new channel requires approval.
- Fully autonomous posting can be enabled later per tenant/channel.
- Sensitive sectors can force approval on every post.
- Provider-specific API limits and review requirements are respected.
- Failed publication never silently marks content as published.

## Feedback loop
Analyst measures performance by channel/topic/format and uses the result to recommend future cadence and content pillars. Optimization should never fabricate attribution or claim causality without evidence.
