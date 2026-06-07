# Code Review Guidelines

## Goals

Code review at Galaxy has two objectives:
1. **Correctness** — Does the code do what it's supposed to do? Are there bugs?
2. **Security** — Does the code introduce any security vulnerabilities?

Style, formatting, and linting are handled by automated tools (ESLint, Prettier). Do not spend review time on style.

## Review Checklist

### Security (Block PR if any fail)

- [ ] No string interpolation in SQL queries
- [ ] All SQL queries use parameterized statements
- [ ] WhatsApp webhook signature validated before processing
- [ ] No secrets, tokens, or PII in logs
- [ ] No secrets returned in API responses
- [ ] Tenant context set before any database query
- [ ] All new tables have RLS enabled and policies defined
- [ ] Agent write actions pass through GovernanceGuard
- [ ] Input validated via Zod schema before use

### Correctness

- [ ] Tests cover the happy path and key failure cases
- [ ] Cross-tenant isolation test added for any new database table
- [ ] Error handling is appropriate — errors are caught, logged, and handled
- [ ] No floating promises (`await` on all async calls)
- [ ] Edge cases handled (null/undefined, empty arrays, zero values)
- [ ] TypeScript strict mode satisfied — no `any`, no `// @ts-ignore`

### Architecture

- [ ] Change is consistent with the relevant ADR(s)
- [ ] New patterns introduced are documented in an ADR if significant
- [ ] No unnecessary abstractions introduced (YAGNI)
- [ ] Dependencies between packages/modules respect the dependency graph

## How to Review

### As a Reviewer

- Review within 1 business day of assignment
- Be specific — point to the exact line and explain why it's a concern
- Distinguish blocking issues (must fix before merge) from suggestions (nice-to-have)
- Approve only when you're confident the code is correct and safe
- Use GitHub's "Request Changes" for blocking issues; "Comment" for suggestions

### Tone

- Review the code, not the author
- Explain the "why" behind your feedback, especially for security concerns
- If you're uncertain, ask a question — don't assume bad intent

### As an Author

- Respond to every comment — either fix it or explain why you disagree
- If you disagree with feedback, discuss in the PR thread — do not silently ignore it
- Mark conversations as resolved only after the feedback is addressed
- Do not force-push after a reviewer has left comments (makes their comments orphaned)

## What NOT to Review

- Code style — ESLint and Prettier handle this
- Variable naming (unless genuinely confusing)
- Preference choices that don't affect correctness or security
- Whether the feature is the right product decision — that's scoped in the ticket

## Turnaround Expectations

| PR Size | Expected First Review |
|---|---|
| Small (< 100 lines) | Within 4 hours |
| Medium (100–500 lines) | Within 1 business day |
| Large (> 500 lines) | Within 2 business days |

Large PRs should be split if possible. If unavoidable, notify the reviewer in advance.
