---
name: security
description: Security best practices, OWASP compliance, and vulnerability prevention
globs: ["**/*.ts", "**/*.js", "**/*.py", "**/*.go"]
---

# Security Skill

## When to Use
- Before deploying any application
- When implementing authentication/authorization
- When handling user input
- When managing secrets and sensitive data
- During code reviews

## Key References
- `references/owasp_top10.md` — Complete OWASP Top 10 with code examples
- `references/auth_patterns.md` — OAuth2, JWT, session management
- `references/input_validation.md` — XSS, SQLi, CSRF prevention
- `references/dependency_scanning.md` — npm audit, Snyk patterns
- `references/secrets_management.md` — Environment variables, vaults

## Quick Checklist
1. All inputs validated and sanitized
2. Authentication properly implemented
3. Authorization checks on all endpoints
4. No secrets in code or logs
5. Dependencies scanned for CVEs
6. HTTPS enforced
7. Security headers configured
8. Error messages don't leak internal details
