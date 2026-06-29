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
