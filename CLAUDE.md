# Setline

Brand-side tracker for retail display programs. Read `docs/build-brief.md` first: it has the product rules, data model, routes, build phases and open decisions.

@AGENTS.md

## Commands

- `npm run dev` starts the app at http://localhost:3000
- `npm test` runs the timeline engine and service tests (services run against an in-memory database)
- `npm run db:generate` writes a new SQL migration after you change `src/lib/db/schema.ts`
- `npm run db:migrate` applies migrations to the Postgres in `DATABASE_URL`
- `npm run typecheck`, `npm run lint`, `npm run build` must all pass before a commit

## Conventions

- The timeline engine in `src/lib/timeline` is pure TypeScript with no framework imports. Keep it that way and add a test for every rule change.
- Dates are ISO strings (`YYYY-MM-DD`) handled in UTC through `src/lib/timeline/dates.ts`. Do not use local-time `Date` math for schedule dates.
- Lead times are never hard-coded in UI or business logic. They come from lead-time profiles resolved with `resolveLeadTimes`.
- Colors come from the tokens in `src/app/globals.css` and the status maps in `src/lib/status.ts`. Every status shows an icon and a label as well as a color.
- Data lives in Postgres through Drizzle (`src/lib/db`). With no `DATABASE_URL`, development uses an embedded database in `.data/` and applies migrations on start.
- All reads and writes go through `src/lib/services`. Every service takes a `Member` and scopes its queries to that workspace; changes call `assertCan` first. Do not query the database from pages or actions directly for anything a role check applies to.
- Server actions in `src/app/actions.ts` start with `requireMember()` (or `requireUser()`), call a service, and turn `InputError`, `AuthError` and `ForbiddenError` into a form message.
- Sign-in is passwordless email links with database sessions (`src/lib/auth`). Only hashes of tokens are stored. Do not log tokens or build links from request headers in production.
- This project has Cache Components on. Anything that reads the session must render inside a Suspense boundary; `AppShell` and `AuthShell` provide one. Follow `node_modules/next/dist/docs/01-app/02-guides/authentication-with-cache-components.md`.
- "Today" comes from `todayInZone(workspace.timezone)`, never from a bare `new Date()` in schedule logic.
- Controls are at least 44 px tall, pages must work at phone width, and text contrast must be at least 4.5:1.
