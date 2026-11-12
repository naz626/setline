# Setline

Brand-side tracker for retail display programs. Read `docs/build-brief.md` first: it has the product rules, data model, routes, build phases and open decisions.

@AGENTS.md

## Commands

- `npm run dev` starts the app at http://localhost:3000
- `npm test` runs the timeline engine tests
- `npm run typecheck`, `npm run lint`, `npm run build` must all pass before a commit

## Conventions

- The timeline engine in `src/lib/timeline` is pure TypeScript with no framework imports. Keep it that way and add a test for every rule change.
- Dates are ISO strings (`YYYY-MM-DD`) handled in UTC through `src/lib/timeline/dates.ts`. Do not use local-time `Date` math for schedule dates.
- Lead times are never hard-coded in UI or business logic. They come from lead-time profiles resolved with `resolveLeadTimes`.
- Colors come from the tokens in `src/app/globals.css` and the status maps in `src/lib/status.ts`. Every status shows an icon and a label as well as a color.
- `src/lib/data/seed.ts` is sample data standing in for the database. `DEMO_TODAY` pins "today" for the samples; remove it when real data arrives.
- Controls are at least 44 px tall, pages must work at phone width, and text contrast must be at least 4.5:1.
