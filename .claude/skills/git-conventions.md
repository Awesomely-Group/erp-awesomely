# Git Conventions Skill

This skill defines the git workflow and conventions for this project.

## Commit Messages

- Write commit messages in English
- Use a single line with a short, clear description
- Follow Conventional Commits format: `type: description`
- Types: `feat`, `fix`, `chore`, `refactor`, `test`, `docs`
- **NEVER add Co-Authored-By or any other footers**
- Keep it under 72 characters

### Examples

```
feat: add user authentication
fix: resolve database connection timeout
chore: update dependencies
refactor: simplify league creation logic
test: add unit tests for Match entity
docs: update README with setup instructions
```

## Branch Naming

Use prefixes to categorize branches:

- `feature-` - New features or enhancements
- `fix-` - Bug fixes
- `release-` - Release branches
- `hotfix-` - Urgent production fixes

Follow with a very short description using kebab-case.

### Examples

```
feature-add-login
feature-league-crud
fix-standings-calculation
fix-auth-token-refresh
release-v1.0.0
hotfix-critical-security-patch
```

## Pull Requests

When creating a pull request:

- **Default target branch**: `develop`
- Use `gh pr create` to open the PR
- Title should be descriptive and follow commit message style
- Body should include:
  - Summary of changes
  - Test plan (if applicable)

### Command

```bash
gh pr create --base develop --title "feat: add user authentication" --body "Summary of changes..."
```

## Releases

When creating a release:

- Create a PR from `develop` to `main`
- Branch name: `release-vX.Y.Z`
- Title: `release: vX.Y.Z`
- Body should include changelog

### Command

```bash
git checkout develop
git pull origin develop
git checkout -b release-v1.0.0
gh pr create --base main --title "release: v1.0.0" --body "Release notes..."
```

## Workflow Summary

1. **Start work**: Always pull `develop` first (`git checkout develop && git pull origin develop`), then create the new branch from `develop` with the appropriate prefix
2. **During work**: Make atomic commits with clear messages
3. **Ready for review**: Create PR targeting `develop`
4. **Release**: Create PR from `develop` to `main`

## Pre-Commit Checklist

Before every commit, run these checks locally to avoid CI failures:

```bash
# 1. Type checking (all packages)
pnpm typecheck

# 2. Linting (ESLint)
pnpm lint

# 3. Formatting (Prettier)
pnpm format:check
```

If formatting fails, fix it with:

```bash
pnpm format
```

### Quick one-liner

Run all checks in sequence (stops on first failure):

```bash
pnpm typecheck && pnpm lint && pnpm format:check
```

### What CI runs

The `lint.yml` workflow runs on every PR to `main`/`develop`:

| Step     | Command             | What it checks             |
| -------- | ------------------- | -------------------------- |
| ESLint   | `pnpm lint`         | Code quality, import order |
| Prettier | `pnpm format:check` | Consistent code formatting |

The `typecheck.yml` workflow:

| Step       | Command          | What it checks              |
| ---------- | ---------------- | --------------------------- |
| TypeScript | `pnpm typecheck` | Type safety, no `any` leaks |

The `backend-ci.yml` workflow:

| Step       | Command                      | What it checks       |
| ---------- | ---------------------------- | -------------------- |
| Unit tests | `pnpm --filter backend test` | Domain + application |

### Common lint pitfalls

- **`import/order`**: No empty lines between imports of the same group (e.g., `@/modules` and `@/shared` are the same `@/` group)
- **Prettier**: Always run `pnpm format` after creating or editing files
- **TypeScript strict**: No `any`, explicit return types, `??` instead of `||` for nullish

## Important Rules

- ✅ Commits: Single line, English, no footers
- ✅ Branches: Use prefixes (feature-, fix-, release-)
- ✅ PRs: Target `develop` by default
- ✅ Releases: PR from `develop` to `main`
- ✅ Always run pre-commit checks before pushing
- ❌ Never add Co-Authored-By
- ❌ Never commit directly to `main` or `develop`
- ❌ Never push without passing `typecheck + lint + format:check`
