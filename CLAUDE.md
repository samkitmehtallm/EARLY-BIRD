# Early Bird — notes for Claude Code

Read `docs/MASTER_PROMPT.md` first; it is the full spec this repo implements.

- Verification gate: `npm run typecheck && npm run lint && npm test && npm run build`.
- Never read env vars at import time; features check `has.*()` from `src/lib/env.ts` and degrade.
- DB pages are `dynamic = "force-dynamic"`. Server-only modules import `"server-only"`.
- Merge/alert rules live in `src/lib/pipeline/merge.ts` (pure) — change tests with them.
- Seed data: edit `scripts/gen-seed.ts`, run `npm run seed:gen`. Only real, sourced shows.
- Times: store UTC, display and compute "today" in Asia/Kolkata (`src/lib/time.ts`).
