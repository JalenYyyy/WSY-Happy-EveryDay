# AGENTS.md

## Project Snapshot

- Stack: Next.js 16 App Router, React 19, Prisma 5, SQLite, Tailwind CSS.
- Product: a two-user shared cat chat MVP with authenticated web UI, cat profiles, nicknames, avatar upload, and OpenAI-compatible LLM replies.
- Main entry points:
  - UI shell: [app/page.tsx](app/page.tsx)
  - Main client UI: [components/chat-app.tsx](components/chat-app.tsx)
  - Auth helpers: [lib/auth.ts](lib/auth.ts)
  - LLM integration: [lib/llm.ts](lib/llm.ts)
  - Prisma schema: [prisma/schema.prisma](prisma/schema.prisma)

## Runbook

- Install: `npm install`
- Local startup: `npm run db:push`, `npm run db:seed`, `npm run dev`
- Type-check: `npm run lint`
- Production build: `npm run build`
- Production start: `npm run start`
- Reset local data after schema changes: `npm run db:reset`

## Working Rules

- Authentication is custom cookie-session based, not NextAuth. Reuse `requireUser()` for pages and `requireApiUser()` for route handlers.
- Keep secrets server-side. Never expose `LLM_API_KEY` or session secrets in client code.
- This repo assumes SQLite for local development. If you change [prisma/schema.prisma](prisma/schema.prisma), also update [prisma/init-db.ts](prisma/init-db.ts) and [prisma/seed.ts](prisma/seed.ts).
- There is no automated test suite yet. For behavior changes, validate with `npm run lint` and the relevant manual smoke checks from [docs/development-guide.md](docs/development-guide.md).
- On Windows, stop the dev server before running `npm run build` if Prisma DLLs are locked.
- Preserve current product constraints unless the task asks otherwise: danger actions require a confirmation step, avatars are stored under `public/uploads/cats/`, and the UI stays light, compact, and hand-crafted.
- **After every code change, update the relevant docs in the same task — do not defer doc updates to a follow-up.** Apply the following rules:
  - New feature or behavior change → update [docs/progress-and-roadmap.md](docs/progress-and-roadmap.md) (add to "已完成" and "最近完成的关键变更") and [docs/product-requirements.md](docs/product-requirements.md) ("已实现功能").
  - New or changed API endpoint → update [docs/technical-design.md](docs/technical-design.md) (API design section).
  - New directory, module, or architectural pattern → update [docs/technical-design.md](docs/technical-design.md) (directory structure and relevant section).
  - New or changed smoke-test step → update [docs/development-guide.md](docs/development-guide.md) (functional test checklist).
  - New environment variable or startup step → update [docs/development-guide.md](docs/development-guide.md) (env vars and runbook) and this file's Runbook section.
  - New known limitation or tech debt → update [docs/progress-and-roadmap.md](docs/progress-and-roadmap.md) (tech debt section).
  - Schema change → also update [docs/technical-design.md](docs/technical-design.md) (data model section).

## Codebase Map

- [app/api/auth/](app/api/auth/) handles login, logout, and current-user endpoints.
- [app/api/cats/](app/api/cats/) and nested routes own cat CRUD, avatar upload, nicknames, and message exchange.
- [app/login/](app/login/) is the public login route; [app/page.tsx](app/page.tsx) is authenticated and redirects unauthenticated users.
- [lib/llm.ts](lib/llm.ts) provides the model call and local fallback behavior when LLM config is missing.
- [docs/technical-design.md](docs/technical-design.md) is the source of truth for data-model details and architecture rationale.

## Validation Expectations

- UI changes: run `npm run lint`; if the dev server is available, verify login, cat switching, create/edit/delete flows, and chat rendering.
- API changes: verify unauthenticated requests fail correctly, authenticated requests succeed, and persisted data still loads after refresh.
- Database changes: run `npm run db:reset` and confirm seed data still produces the default users and cats.

## Reference Docs

- Setup and manual smoke checklist: [docs/development-guide.md](docs/development-guide.md)
- Product scope and constraints: [docs/product-requirements.md](docs/product-requirements.md)
- Architecture and data model: [docs/technical-design.md](docs/technical-design.md)
- Progress and known gaps: [docs/progress-and-roadmap.md](docs/progress-and-roadmap.md)