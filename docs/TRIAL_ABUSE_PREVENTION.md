# VentaNexIA — Trial abuse prevention

## Why IP-only blocking is not enough
IP addresses change, VPNs/proxies are common, mobile networks rotate addresses, and many legitimate employees share one office IP.

## Layered trial identity
The backend evaluates:
- exact email identity (HMAC only in abuse log);
- email/company domain;
- first-party device identifier;
- network prefix (HMAC only; raw IP is not stored in the abuse table);
- user-agent signature (HMAC);
- trial history and request velocity.

## Default controls
- 1 allowed trial per exact email / 180 days.
- 1 allowed trial per device / 180 days.
- Up to 3 allowed trials per network prefix / 30 days to avoid blocking legitimate offices.
- Company-domain velocity is monitored; serial trials can require review.
- Excessive attempts from one network are denied.
- Free-email identities are scored more conservatively after prior network trials.

## Privacy
Signals in `vnx_trial_attempts` are HMAC pseudonyms, not raw IP/email/device values.
The HMAC secret lives only server-side.
The system should have an explicit retention policy before production launch.

## Commercial fallback
A denied trial does not block purchasing. The prospect can proceed to a paid plan or a controlled sales demo.
