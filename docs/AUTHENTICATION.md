# VentaNexIA authentication

## Client portal

1. A same-origin POST requests a magic link.
2. Requests are rate-limited by an HMAC of email and source address.
3. The random token is stored only as an HMAC and expires after 20 minutes.
4. `vnx_consume_portal_login_token` consumes the token atomically.
5. Login creates a signed cookie and a hashed server-side session record.
6. Protected handlers require both a valid signature and an active database session.
7. Logout revokes that database session and clears the cookie.

The `vnx_portal` cookie is HttpOnly, Secure in production, SameSite=Strict and expires after seven days.

## Administration

Admin login is protected by same-origin validation and a persistent limit of five failed attempts per 15 minutes and source address. Use `ADMIN_PASSWORD_HASH`; `ADMIN_PASSWORD` exists only as a temporary migration fallback.

Generate the hash locally:

```sh
node scripts/hash-admin-password.mjs "a-long-unique-password"
```

Store the printed value as `ADMIN_PASSWORD_HASH` in Vercel. Never commit it.

The admin cookie is HttpOnly, Secure, SameSite=Strict and expires after eight hours.

## Required rollout

1. Apply `supabase/migrations/009_operational_hardening.sql`.
2. Configure different random values of at least 32 characters for `PORTAL_SESSION_SECRET` and `ADMIN_SESSION_SECRET`.
3. Configure `ADMIN_PASSWORD_HASH`, test login, then remove `ADMIN_PASSWORD`.
4. Verify `PUBLIC_APP_URL` exactly matches the production origin.
5. Redeploy and test magic-link single use, logout revocation, rate limiting and tenant isolation.

Changing either session secret invalidates every cookie signed with that secret.
