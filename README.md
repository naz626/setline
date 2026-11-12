# Setline

Every display program, counted back from its in-store date.

Setline helps brand teams run retail display programs with their vendors: it generates key dates from the in-store date, tracks approvals, and shows whether each vendor is working, waiting on you, or backlogged.

## Status

Early scaffold. Working today, on sample data:

- Programs dashboard (`/programs`) and program detail (`/programs/:id`)
- Lead-time profiles by vendor, origin and process, with a live preview (`/settings/lead-times`)
- Timeline engine with tests (`src/lib/timeline`)

Not built yet: database, sign-in, roles, saving changes, and the remaining screens. See `docs/build-brief.md` for the plan.

## Run it

```bash
npm install
npm run dev
```

## Check it

```bash
npm test
npm run typecheck
npm run lint
npm run build
```
