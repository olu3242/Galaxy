## Summary

<!-- What does this PR do? 2-3 sentences. -->

## Type of Change

- [ ] Feature
- [ ] Bug fix
- [ ] Security fix
- [ ] Foundation / infrastructure
- [ ] Documentation
- [ ] Refactor (no functional change)

## Related Ticket

<!-- Link to ticket: GALAXY-### -->

## Security Checklist

**All items must be checked or marked N/A before this PR can be merged.**

- [ ] No string interpolation in SQL queries (all queries parameterized)
- [ ] No secrets, tokens, or PII in logs
- [ ] WhatsApp webhook signature validated (if touching webhook handler)
- [ ] Tenant context set before database queries (if touching DB)
- [ ] New tables have RLS policy defined (if adding tables)
- [ ] Agent actions pass GovernanceGuard (if touching Agent OS)
- [ ] Input validated via Zod schema (if adding/changing API endpoints)

## Testing

- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] Cross-tenant RLS isolation test added (if new table added)
- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm test` passes locally

## Architecture

- [ ] Change is consistent with relevant ADR(s) (list: ADR-___)
- [ ] New ADR created if this PR makes a significant architectural decision
- [ ] No new patterns introduced that conflict with existing ADRs

## Notes for Reviewer

<!-- Anything the reviewer should pay special attention to. -->
