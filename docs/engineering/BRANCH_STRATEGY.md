# Galaxy Branch Strategy

## Branch Model

```
main          Production-ready code. Protected. Never commit directly.
  └── develop   Integration branch. All feature PRs target here.
        ├── sprint/1   Sprint integration branch (optional, for large sprints)
        ├── feat/GALAXY-001-identity-os-rbac    Feature branch
        ├── feat/GALAXY-002-whatsapp-webhook    Feature branch
        ├── fix/GALAXY-015-rls-missing-table    Bug fix branch
        ├── foundation/geos                     Foundation work (current)
        └── security/rotate-jwt-secret          Security-specific work
```

## Branch Types

| Prefix              | Purpose                             | Base                | PR Target          |
| ------------------- | ----------------------------------- | ------------------- | ------------------ |
| `feat/`             | New feature or capability           | `develop`           | `develop`          |
| `fix/`              | Bug fix                             | `develop`           | `develop`          |
| `foundation/`       | Infrastructure, tooling, repo setup | `main` or `develop` | `develop`          |
| `security/`         | Security fixes or hardening         | `develop`           | `develop`          |
| `sprint/<n>`        | Sprint integration branch           | `develop`           | `develop`          |
| `hotfix/`           | Critical production fix             | `main`              | `main` + `develop` |
| `release/<version>` | Release preparation                 | `develop`           | `main`             |

## Rules

### `main`

- Protected branch — direct pushes prohibited
- Requires PR + 1 approval + CI green
- Only merges from `release/*` or `hotfix/*` branches
- Every merge to main creates a tag

### `develop`

- Protected branch — direct pushes prohibited
- Requires PR + 1 approval + CI green
- All feature and fix work lands here first

### Feature Branches

- Branch from `develop`
- Name format: `feat/<ticket-id>-<short-slug>` (e.g., `feat/GALAXY-001-rbac-engine`)
- Delete after merge
- Keep focused — one logical change per branch
- Rebase on `develop` before opening PR (not merge commits)

### Hotfixes

- Branch from `main`
- Must be merged to BOTH `main` AND `develop`
- Tag `main` after merge: `v0.x.y+1`

## Merge Strategy

- **Feature → develop:** Squash merge (clean history on develop)
- **develop → main (release):** Merge commit (preserves release boundary)
- **hotfix → main:** Merge commit with tag

## Release Process

1. Cut `release/v0.x.0` from `develop` when sprint is complete and tested
2. Only bug fixes and documentation go into a release branch (no new features)
3. CI must be green on the release branch
4. Merge `release/v0.x.0` → `main` with merge commit
5. Tag: `git tag -a v0.x.0 -m "Release v0.x.0"`
6. Merge `main` back into `develop` to capture any release-branch fixes
7. Delete the release branch

## Naming Conventions

```bash
# Good
feat/GALAXY-042-leave-workflow-template
fix/GALAXY-108-rls-missing-index
foundation/geos
security/whatsapp-token-encryption
hotfix/GALAXY-200-webhook-signature-bypass

# Bad — too vague
feature/new-stuff
fix/bug
wip
john-branch
```
