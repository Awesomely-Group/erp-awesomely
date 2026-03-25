# Secrets Management

## .env Files

```bash
# .env (NEVER commit)
DATABASE_URL=postgresql://user:pass@localhost:5432/db
JWT_SECRET=your-secret-key
STRIPE_KEY=sk_test_...

# .env.example (commit this — no real values)
DATABASE_URL=postgresql://user:pass@localhost:5432/db
JWT_SECRET=change-me
STRIPE_KEY=sk_test_...
```

**.gitignore**:
```
.env
.env.local
.env.*.local
```

## Environment Variable Access

```typescript
// Validate required env vars at startup
const requiredEnvVars = ['DATABASE_URL', 'JWT_SECRET'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required env var: ${envVar}`);
  }
}

// Use Zod for env validation
import { z } from 'zod';
const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  NODE_ENV: z.enum(['development', 'production', 'test']),
});
const env = envSchema.parse(process.env);
```

## Pre-commit Secret Detection

```bash
# Install git-secrets
brew install git-secrets

# Setup in repo
git secrets --install
git secrets --register-aws

# Add custom patterns
git secrets --add 'sk_live_[a-zA-Z0-9]+'
git secrets --add 'PRIVATE.KEY'
```

## CI/CD Secrets

- Use GitHub Actions secrets (Settings > Secrets)
- Never echo secrets in CI logs
- Use environment-specific secrets
- Rotate secrets regularly
- Use OIDC for cloud provider auth (no long-lived keys)

## Secret Rotation

1. Generate new secret
2. Update in secret manager/env
3. Deploy with new secret
4. Verify functionality
5. Revoke old secret
6. Update documentation
