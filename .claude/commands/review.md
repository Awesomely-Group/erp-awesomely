---
name: review
description: Run a comprehensive code review on changed files
---

# Code Review Command

Review the current changes in the working directory for:

1. **Code Quality**: Clean code principles, SOLID, DRY
2. **Security**: Potential vulnerabilities (XSS, SQL injection, secrets)
3. **Performance**: Potential bottlenecks or inefficiencies
4. **Best Practices**: Coding standards compliance

## Steps

1. Run `git diff` to see current changes
2. For each changed file, analyze the code
3. Provide a structured review with:
   - Strengths
   - Critical issues (must fix)
   - Suggestions (nice to have)
   - Action items

## Output Format

Group by severity: Critical > Major > Minor > Suggestion.
Include file path and line numbers. Provide concrete fix suggestions.
