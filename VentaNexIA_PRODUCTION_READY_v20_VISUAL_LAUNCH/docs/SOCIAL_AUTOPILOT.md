# VNX Social Autopilot

## Supported architecture
A single content model feeds provider adapters for LinkedIn, Instagram, Facebook, TikTok, X or an orchestration provider such as Metricool.

## Tenant setup
Each tenant defines:
- brand voice;
- audiences;
- content pillars;
- forbidden topics;
- claims policy;
- channels;
- frequency and quiet periods;
- approval mode by channel;
- UTM conventions;
- media rules.

## Publishing modes
- `draft_only`: VNX generates, user publishes manually.
- `approval_required`: VNX plans and schedules; customer/Guardian approves before publish.
- `autonomous`: VNX publishes automatically within policy.

## Provider realities
OAuth/provider consent is required. Some platforms require app review, approved scopes, page roles, domain verification, media constraints or paid API access. These are connection requirements, not product failures.

## Recommended default
First 2-4 weeks: approval_required. Once content quality and policies are validated, selected low-risk content categories may move to autonomous.
