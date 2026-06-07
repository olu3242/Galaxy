# Galaxy Secrets Management

**Version:** 1.0
**Date:** 2026-06-07

---

## Principle

**No secret ever touches a file that could be committed to git, a log, or an API response.**

Violations of this principle are treated as security incidents — not code review comments.

---

## Secret Classification

| Classification             | Examples                                 | Storage                            |
| -------------------------- | ---------------------------------------- | ---------------------------------- |
| Platform secrets           | JWT_SECRET, internal API keys            | AWS Secrets Manager                |
| Tenant credentials         | WhatsApp access tokens, per-org API keys | Database (column-level encryption) |
| Infrastructure credentials | Database URL, Redis URL                  | AWS Secrets Manager                |
| AI API keys                | Anthropic API key                        | AWS Secrets Manager                |
| Third-party service keys   | S3 credentials, Sentry DSN               | AWS Secrets Manager                |

---

## Environments

### Local Development

1. Copy `.env.example` to `.env`
2. Fill in development values (use test accounts, not production)
3. `.env` is in `.gitignore` — it MUST NOT be committed

**Never use production secrets in local development.**

### CI/CD (GitHub Actions)

All secrets are stored as **GitHub Actions Secrets** (not environment variables in YAML files). Reference them in workflows as:

```yaml
env:
  JWT_SECRET: ${{ secrets.JWT_SECRET }}
```

CI uses a dedicated set of test secrets — never production values.

### Staging / Production

Secrets are stored in **AWS Secrets Manager** and injected at runtime via:

1. IAM instance role for EC2/EKS pods (no credentials stored on the machine)
2. AWS SDK auto-discovers credentials from the instance metadata service
3. Application loads secrets at startup via `@aws-sdk/client-secrets-manager`

The `packages/config/src/index.ts` environment loader is the single source of truth for which variables are required. In production, the ECS/EKS task definition references secrets from Secrets Manager.

---

## Secret Rotation

| Secret                              | Rotation Frequency                               | Rotation Method                                                               |
| ----------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------- |
| JWT_SECRET                          | 90 days                                          | Rolling rotation (old key valid for 24h after new key active)                 |
| Anthropic API key                   | 90 days                                          | Manual rotation via Anthropic dashboard → Secrets Manager update              |
| WhatsApp access tokens (per tenant) | As required by Meta (or on suspected compromise) | Automated via Meta Graph API token refresh                                    |
| Database password                   | 180 days                                         | AWS RDS password rotation (zero-downtime via Secrets Manager rotation Lambda) |
| Internal service API keys           | 90 days                                          | Automated rotation script                                                     |

---

## Prohibited Patterns

```bash
# ❌ NEVER hardcode secrets
const jwtSecret = 'my-secret-key';

# ❌ NEVER read process.env directly for secrets
const dbUrl = process.env.DATABASE_URL;

# ❌ NEVER log secrets
logger.info({ jwt_secret: env.JWT_SECRET }, 'Config loaded');

# ❌ NEVER return secrets in API responses
res.json({ config: env });

# ❌ NEVER commit .env files
git add .env
```

---

## Permitted Patterns

```typescript
// ✅ Read secrets via the validated env object from @galaxy/config
import { env } from '@galaxy/config';
const jwtSecret = env.JWT_SECRET;

// ✅ In production, load from AWS Secrets Manager at startup
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

// ✅ Log that a secret was used, not its value
logger.info({ action: 'jwt_verified', userId }, 'Token validated');
```

---

## Incident Response: Exposed Secret

If a secret is exposed (committed to git, logged, leaked via API):

1. **Immediately rotate the secret** — do not wait for analysis
2. Revoke the old value in the issuing system (AWS, Anthropic dashboard, Meta, etc.)
3. Audit logs for any access using the exposed credential
4. Assess blast radius: what data could have been accessed?
5. Notify affected parties per the Security Policy
6. Post-incident review: how did the exposure happen? Update controls.

For **git commits containing secrets:**

1. Rotate the secret immediately
2. The commit history cannot be trusted to be private — assume the secret is compromised
3. Use `git filter-repo` to rewrite history and force-push (requires team coordination)
4. Notify all contributors to re-clone

---

## Tenant Credential Encryption

Per ADR-004, each tenant's WhatsApp access token is stored encrypted in the database using `pgcrypto`:

```sql
-- Store encrypted token
INSERT INTO organization_whatsapp_credentials (organization_id, access_token_enc)
VALUES ($1, pgp_sym_encrypt($2::text, $3));
-- $3 = org-specific encryption key, stored in AWS Secrets Manager as 'galaxy/org/{orgId}/whatsapp-key'

-- Retrieve and decrypt token
SELECT pgp_sym_decrypt(access_token_enc, $1) AS access_token
FROM organization_whatsapp_credentials
WHERE organization_id = $2;
```

The org-specific encryption key is loaded from AWS Secrets Manager at the time of the operation — it is never stored in the database or application memory longer than the request lifetime.
