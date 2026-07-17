<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Project Quick Start

- Runtime: Next.js 16.2.9 + React 19 + TypeScript.
- Install: `npm install`
- Dev server: `npm run dev`
- Build: `npm run build`
- Lint: `npm run lint`

## Source Of Truth

- Product and scope: [PRODUCT_BOOK.md](PRODUCT_BOOK.md)
- Technical architecture and multi-tenant model: [ARCHITECTURE.md](ARCHITECTURE.md)
- General project usage: [README.md](README.md)

## API Focus (Next App Router)

- Place API endpoints under `src/app/api/**/route.ts`.
- Export method handlers as `export async function POST|GET|PUT|DELETE(request: Request)`.
- Return JSON via `NextResponse.json(payload, { status })`.
- Keep handlers server-only and avoid importing client-only modules.

Reference implementation:
- Public marketplace lead endpoint: [src/app/api/marketplace/lead/route.ts](src/app/api/marketplace/lead/route.ts)

## API Implementation Pattern

Follow this sequence for write endpoints:

1. Parse and normalize request body fields (trim strings, lowercase email).
2. Validate required input early and return `400` for invalid payloads.
3. Fail fast on missing env vars with `500`.
4. Execute primary DB write first.
5. Run secondary side effects (lookups, emails, notifications) as best effort.
6. Never fail a successful critical write because a side-effect failed.
7. Catch unexpected exceptions and return stable error JSON with `500`.

## Supabase And Multi-Tenant Rules

- Data isolation is mandatory: operational tables are tenant-scoped by `dealer_id`.
- Respect RLS assumptions and tenant boundaries from [ARCHITECTURE.md](ARCHITECTURE.md).
- For public/anonymous writes, keep insert logic minimal and explicit.
- Use service-role only for strictly privileged reads/writes that anon/auth clients cannot do.
- When querying aliased relational joins in Supabase JS, normalize potential array results before typed casts.

## Environment Variables Used By API Layer

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `APP_BASE_URL`

## DB Workflow Notes

- SQL schema and migrations live in `supabase/schema.sql` and `supabase/migrations/`.
- For data-model or policy changes, add a new migration instead of editing past migrations.
- Keep API behavior aligned with RLS and trigger logic in Supabase SQL files.

## Mandatory Working Rules

These rules apply to every task in this repository and take precedence over convenience or cleanup work.

### Scope And Worktree Safety

- Work only on the task explicitly requested by the user. Do not broaden the scope, perform opportunistic refactors, or fix unrelated issues without authorization.
- Preserve all pre-existing local changes, including modified, staged, untracked, and ignored files. Treat them as user-owned work.
- Before editing, inspect the relevant Git status and diff. After editing, verify that only task-scoped files changed as a result of the work.
- Never overwrite, revert, reformat, stage, or otherwise alter unrelated local changes.
- If a required change overlaps ambiguous user-owned work, stop and ask for direction instead of guessing.

### Git And Destructive Operations

- Do not create, amend, squash, rebase, or otherwise modify commits without explicit user authorization.
- Do not push, force-push, publish branches, open pull requests, or modify remote repository state without explicit user authorization.
- Destructive deletion is forbidden. Do not use commands such as `git reset --hard`, `git clean`, `git checkout --`, `git restore`, destructive `rm`, or equivalent operations that can discard files, changes, data, or history.
- A user request to remove a specific artifact authorizes only that narrowly identified removal; it does not authorize broad cleanup.

### Supabase Migrations

- Implement every database schema, data, function, trigger, grant, or RLS change as a new migration under `supabase/migrations/`.
- Never edit, rename, reorder, replace, or delete an existing migration that may already have been applied.
- Migrations must be incremental, forward-only, safely repeatable, and idempotent wherever PostgreSQL permits it.
- Use guards such as `if exists`, `if not exists`, catalog checks, and conflict-safe data operations when appropriate.
- Preserve tenant isolation in every migration. Review `dealer_id`, RLS policies, grants, `security definer` functions, and `search_path` explicitly.
- Keep `supabase/schema.sql` aligned with the resulting schema only when the task explicitly requires updating the schema snapshot; it is not a substitute for a migration.

### Mandatory Verification

- After every repository modification, run the TypeScript check with `npx tsc --noEmit` and the production build with `npm run build`.
- A task is not complete until both commands have been attempted after the final task-scoped change.
- If either command fails because of sandboxing, network access, missing services, or environment configuration, report the exact limitation and distinguish it from a source-code failure.
- Run additional tests relevant to the changed behavior when available and within scope.
- Explicitly list every relevant test or validation that was not run, including the reason. Never imply that unexecuted tests passed.

### Final Report

- At the end of every task, create or update `CODEX_REPORT.md` in the repository root.
- The report must include: requested scope, files changed by the task, preserved local changes, commands executed, typecheck result, build result, tests run, tests not run with reasons, known limitations, and confirmation that no unauthorized commit or push occurred.
- Keep the report factual and specific to the current task. Do not claim success for checks that were not executed.
- `CODEX_REPORT.md` is the only routine reporting artifact; do not create additional report files unless the user explicitly requests them.
