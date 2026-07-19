# Build Health Report

_Generated: 2026-06-09_

---

## Summary

All build, lint, and typecheck commands pass successfully across the full monorepo.

---

## pnpm install

```
Already up to date
Done in 10.7s
```

**Result: Pass**

---

## pnpm lint

```
Tasks:    87 successful, 87 total
Cached:   61 cached, 87 total
Time:     30.466s
```

**Result: Pass (1 warning, 0 errors)**

### Warning

```
/home/user/Galaxy/apps/worker/src/processors/workflow-execution.ts
  72:9  warning  Unexpected console statement. Only these console methods are
                 allowed: warn, error  no-console
```

This is a lint warning (not an error) in the worker processor. The `console.log` at line 72 should be replaced with `console.warn` or `console.error` or removed. Not blocking.

---

## pnpm typecheck

```
Tasks:    87 successful, 87 total
Cached:   73 cached, 87 total
Time:     9.193s
```

**Result: Pass — 0 type errors across all 87 packages**

All packages compile cleanly under TypeScript strict mode.

---

## pnpm build

```
Tasks:    46 successful, 46 total
Cached:   41 cached, 46 total
Time:     28.658s
```

**Result: Pass — all 46 build targets succeeded**

### Web Build Output (Next.js 14)

```
Route (app)                    Size     First Load JS
┌ ○ /                          53.8 kB    141 kB
└ ○ /_not-found                871 B     87.8 kB

+ First Load JS shared by all  86.9 kB
```

Static pages prerendered successfully. Bundle sizes are within acceptable range.

---

## Overall Build Health

| Check     | Status | Notes                             |
| --------- | ------ | --------------------------------- |
| install   | Pass   | All dependencies resolved         |
| lint      | Pass   | 1 warning (console.log in worker) |
| typecheck | Pass   | 0 type errors                     |
| build     | Pass   | All 46 targets built successfully |

**Build Health: GREEN**

---

## Recommended Fix

Replace `console.log` in `apps/worker/src/processors/workflow-execution.ts` line 72 with `console.warn` or a structured logger call to eliminate the lint warning.
