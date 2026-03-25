# Dependency Scanning

## npm/pnpm Audit

```bash
# Check for vulnerabilities
npm audit
pnpm audit

# Auto-fix where possible
npm audit fix

# JSON output for CI
npm audit --json
```

## Snyk CLI

```bash
# Install
npm install -g snyk

# Test project
snyk test

# Monitor continuously
snyk monitor

# Fix vulnerabilities
snyk fix
```

## GitHub Dependabot

Create `.github/dependabot.yml`:
```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 10
    labels:
      - "dependencies"
```

## CI/CD Integration

```yaml
# GitHub Actions
- name: Security audit
  run: npm audit --audit-level=high

- name: Snyk scan
  uses: snyk/actions/node@master
  env:
    SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
```

## Lockfile Integrity

- Always commit lockfiles (package-lock.json, pnpm-lock.yaml)
- Use `npm ci` / `pnpm install --frozen-lockfile` in CI
- Review lockfile changes in PRs
