# RPG-OS Production Environment Configuration Guide

> **CRITICAL**: This document describes the production environment configuration for RPG-OS.
> Never commit real credentials to version control. Use a proper secret management system.

---

## Table of Contents

1. [Overview](#overview)
2. [Required Variables](#required-variables)
3. [Supabase Configuration](#supabase-configuration)
4. [Payment Provider Setup](#payment-provider-setup)
5. [Government Integration Setup](#government-integration-setup)
6. [Security Hardening](#security-hardening)
7. [Rate Limiting Configuration](#rate-limiting-configuration)
8. [Body Size Limits](#body-size-limits)
9. [Fake Provider Safety](#fake-provider-safety)
10. [Deployment Checklist](#deployment-checklist)
11. [Secret Rotation](#secret-rotation)
12. [Environment Differences](#environment-differences)

---

## Overview

RPG-OS uses environment variables for all configuration. The application **will not start** without required variables in production.

### Core Principles

1. **No defaults in production** - All required variables must be explicitly set
2. **Secret management** - Use AWS Secrets Manager, HashiCorp Vault, or equivalent
3. **Principle of least privilege** - Service role keys only for server-side admin operations
4. **Fail closed** - Missing configuration causes startup failure, not degraded operation
4. **Fake providers banned** - `ALLOW_FAKE_PROVIDERS=false` is enforced in production

---

## Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | `https://abc.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Anon key (client-safe) | `sb_publishable_...` |
| `SUPABASE_SECRET_KEY` | Server-side secret key | `sb_secret_...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin service role key | `eyJhbGciOiJIUzI1NiIs...` |
| `NEXT_PUBLIC_APP_URL` | Production app URL | `https://app.rpg-os.com` |
| `NODE_ENV` | Must be `production` | `production` |
| `ALLOW_FAKE_PROVIDERS` | Must be `false` | `false` |
| `PAYMENT_PROVIDER` | Active payment provider | `STRIPE_CONNECT` |

---

## Supabase Configuration

### Project Setup

1. Create Supabase project in target region (EU for GDPR)
2. Enable required extensions: `pgcrypto`, `uuid-ossp`, `pgjwt`
3. Configure authentication providers (email, OAuth if needed)
4. Set up Row Level Security (RLS) policies per migration files

### Keys Explained

| Key | Purpose | Exposure |
|-----|---------|----------|
| `NEXT_PUBLIC_SUPABASE_URL` | API endpoint | Client + Server |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Anon authentication | Client + Server |
| `SUPABASE_SECRET_KEY` | Server operations | Server only |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin bypasses RLS | Server only (webhooks, jobs) |

### Database Migrations

Run migrations in order before deployment:
```bash
# Local only - NEVER run on production directly
supabase db push

# Production: Use migration files via CI/CD
```

---

## Payment Provider Setup

### Supported Providers

| Provider | Type | Status |
|----------|------|--------|
| `STRIPE_CONNECT` | Full marketplace payments | ✅ Production Ready |
| `ADYEN_FOR_PLATFORMS` | European marketplace payments | ✅ Production Ready |
| `SIBS` | Portuguese Multibanco/MBWay | 🔧 Requires SIBS onboarding |
| `FAKE` | Development/testing only | ❌ **Banned in production** |

### Stripe Connect Configuration

```env
PAYMENT_PROVIDER=STRIPE_CONNECT
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_CONNECT_CLIENT_ID=ca_...
```

**Webhook Events to Configure:**
- `payment_intent.succeeded`
- `payment_intent.payment_failed`
- `charge.refunded`
- `payout.paid`
- `payout.failed`

### Adyen for Platforms Configuration

```env
PAYMENT_PROVIDER=ADYEN_FOR_PLATFORMS
ADYEN_API_KEY=...
ADYEN_MERCHANT_ACCOUNT=...
ADYEN_HMAC_KEY=...
ADYEN_CLIENT_KEY=...
```

**Webhook Configuration:**
- Enable "Standard Notification" webhook
- Configure HMAC signature validation

### SIBS Configuration (Requires Onboarding)

```env
PAYMENT_PROVIDER=SIBS
SIBS_CLIENT_ID=...
SIBS_CLIENT_SECRET=...
SIBS_API_URL=https://api.sibs.pt
SIBS_TERMINAL_ID=...
```

> ⚠️ SIBS requires official onboarding with SIBS/UNICRE. Not available for immediate use.

---

## Government Integration Setup

### Provider Status

| Provider | Status | Onboarding Required |
|----------|--------|---------------------|
| AT / e-Fatura | Prepared | ✅ Yes (AT Portal) |
| Segurança Social | Prepared | ✅ Yes (SS Direct) |
| Autenticação.gov | Prepared | ✅ Yes (AMA) |
| CMD | Interface Only | ❌ Not available |
| Gov.pt | Interface Only | ❌ Not available |

### AT / e-Fatura Configuration

```env
AT_API_ENDPOINT=https://api.portaldasfinancas.gov.pt
AT_CLIENT_ID=your_client_id
AT_CLIENT_SECRET=your_client_secret
AT_SOFTWARE_CERTIFICATE=path/to/cert.p12
AT_CERTIFICATE_PASSWORD=cert_password
AT_ORGANIZATION_NIF=501234560
```

**Prerequisites:**
1. Register software at AT Portal
2. Obtain software certificate
3. Complete OAuth2 PKCE flow setup
4. Configure webhook endpoints

### Segurança Social Configuration

```env
SEGURANCA_SOCIAL_API_ENDPOINT=https://api.seg-social.pt
SEGURANCA_SOCIAL_CLIENT_ID=...
SEGURANCA_SOCIAL_CLIENT_SECRET=...
SEGURANCA_SOCIAL_ORGANIZATION_NISS=...
SEGURANCA_SOCIAL_CERTIFICATE=path/to/cert.p12
SEGURANCA_SOCIAL_CERTIFICATE_PASSWORD=...
```

### Autenticação.gov Configuration

```env
AUTENTICACAO_GOV_API_ENDPOINT=https://autenticacao.gov.pt
AUTENTICACAO_GOV_CLIENT_ID=...
AUTENTICACAO_GOV_CLIENT_SECRET=...
AUTENTICACAO_GOV_CERTIFICATE=path/to/cert.p12
AUTENTICACAO_GOV_CERTIFICATE_PASSWORD=...
```

---

## Security Hardening

### CSRF Protection

- Enabled by default for all browser mutations
- Token stored in `csrf_token` cookie (HttpOnly, Secure, SameSite=Strict)
- Client must include `x-csrf-token` header for POST/PUT/DELETE
- Webhooks exempt (use signature validation instead)

### Rate Limiting

| Category | Window | Max Requests | Purpose |
|----------|--------|--------------|---------|
| `auth` | 1 min | 10 | Login, register, password reset |
| `payment` | 1 min | 20 | Payment creation, refunds |
| `government` | 1 min | 30 | Government connections, consents |
| `webhook` | 1 min | 50 | Payment/government webhooks |
| `read` | 1 min | 100 | Dashboard, lists, searches |
| `admin` | 1 min | 15 | Mutations, deletions |

**Note**: In-memory store. For multi-instance, replace with Redis (`@upstash/ratelimit`).

### Body Size Limits

| Category | Limit | Use Case |
|----------|-------|----------|
| `json` | 1 MB | Standard APIs |
| `government` | 5 MB | Fiscal documents |
| `webhook` | 500 KB | Payment/government webhooks |
| `file` | 25 MB | Document uploads |
| `saft` | 50 MB | SAF-T XML exports |

### Headers Security

```http
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

---

## Fake Provider Safety

### The Problem

Fake providers (`FakePaymentProvider`, `FakeATProvider`, etc.) are designed for:
- Local development
- Automated tests
- CI/CD pipelines

**They MUST NEVER be active in production.**

### Safety Mechanisms Implemented

1. **PaymentEngine**: No auto-registration. Requires explicit `registerProvider()`
2. **Payment Webhook**: Rejects `FAKE` provider in production (HTTP 400)
3. **Government Registry**: `registerDefaultProviders()` is no-op in production
4. **Environment Guard**: `ALLOW_FAKE_PROVIDERS=false` enforced at startup
5. **Explicit Test Registration**: `registerFakeProviderForTesting()` throws in production

### Verification

```bash
# Confirm fake providers are NOT registered
curl -H "x-payment-provider: FAKE" https://api.rpg-os.com/api/webhooks/payments
# Expected: 400 "Invalid or unsupported payment provider: FAKE"

# Confirm government fake not registered
curl https://api.rpg-os.com/api/administracao/governo/connections
# Should return empty or real connections only
```

---

## Deployment Checklist

### Pre-Deployment

- [ ] All required environment variables set in secret manager
- [ ] `NODE_ENV=production` confirmed
- [ ] `ALLOW_FAKE_PROVIDERS=false` confirmed
- [ ] Payment provider credentials validated
- [ ] Government provider credentials validated (if enabled)
- [ ] Supabase migrations applied
- [ ] SSL/TLS certificates configured
- [ ] Domain DNS configured
- [ ] Webhook URLs configured in provider dashboards

### Post-Deployment Verification

- [ ] Health check endpoint returns 200
- [ ] Authentication flow works (login, session, logout)
- [ ] Organization switching works
- [ ] Payment webhook test succeeds (use provider test mode)
- [ ] Government connection test succeeds (if configured)
- [ ] Rate limiting responds with 429 under load
- [ ] CSRF protection blocks requests without token
- [ ] Body size limits reject oversized payloads (413)
- [ ] Replay protection rejects duplicate webhooks (409)

### Rollback Plan

1. Keep previous deployment artifacts
2. Database migrations are backward-compatible (additive only)
3. Feature flags can disable new functionality
4. Blue/green deployment recommended

---

## Secret Rotation

| Secret | Rotation Frequency | Process |
|--------|-------------------|---------|
| `SUPABASE_SERVICE_ROLE_KEY` | 90 days | Supabase Dashboard → Settings → API → Regenerate |
| `STRIPE_SECRET_KEY` | 90 days | Stripe Dashboard → Developers → API Keys → Roll |
| `STRIPE_WEBHOOK_SECRET` | 90 days | Stripe Dashboard → Webhooks → Signing Secret → Roll |
| `AT_CLIENT_SECRET` | Per AT policy | AT Portal → Application → Regenerate |
| `SEGURANCA_SOCIAL_CLIENT_SECRET` | Per SS policy | SS Direct → Application → Regenerate |
| `CSRF_SECRET` | 180 days | Generate new: `openssl rand -hex 32` |
| `SESSION_SECRET` | 180 days | Generate new: `openssl rand -hex 32` |

### Rotation Procedure

1. Generate new secret
2. Add to secret manager with new version
3. Deploy with new secret (zero-downtime if supported)
4. Verify functionality
5. Revoke old secret after confirmation
6. Update documentation

---

## Environment Differences

| Aspect | Development | Staging | Production |
|--------|-------------|---------|------------|
| `NODE_ENV` | `development` | `staging` | `production` |
| `ALLOW_FAKE_PROVIDERS` | `true` | `false` | `false` |
| `PAYMENT_PROVIDER` | `FAKE` | `STRIPE_CONNECT` (test) | `STRIPE_CONNECT` (live) |
| `LOG_LEVEL` | `debug` | `info` | `warn` |
| Supabase | Local/Docker | Staging project | Production project |
| Rate Limits | Disabled | Enabled (relaxed) | Enabled (strict) |
| CSRF | Enabled | Enabled | Enforced |
| Fake Providers | Auto-registered | Manual only | **Forbidden** |

### Staging Specifics

- Use Stripe test mode keys
- Use government sandbox endpoints
- Rate limits at 10x production values
- Debug logging enabled
- Fake providers available via explicit registration

---

## Troubleshooting

### Common Issues

**"Missing required environment variable"**
- Check secret manager has all required variables
- Verify variable names match exactly (case-sensitive)

**"Invalid payment provider: FAKE"**
- `PAYMENT_PROVIDER` must not be `FAKE` in production
- Check `ALLOW_FAKE_PROVIDERS=false`

**"CSRF token validation failed"**
- Client not sending `x-csrf-token` header
- Cookie not being sent (check SameSite, Secure flags)

**"Payment provider not registered"**
- Call `paymentEngine.registerProvider()` at startup
- Verify provider credentials are valid

**"Duplicate webhook event"**
- Normal replay protection behavior
- Check provider webhook retry configuration

---

## Support Contacts

| System | Contact |
|--------|---------|
| Supabase | support@supabase.com |
| Stripe | support@stripe.com |
| Adyen | support@adyen.com |
| AT/e-Fatura | Centro de Atendimento AT |
| Segurança Social | Linha Segurança Social |
| Autenticação.gov | AMA - Agência Modernização |

---

*Last Updated: 2026-09-03*
*Version: 1.0*
*Classification: INTERNAL - Do not distribute externally*