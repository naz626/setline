# Setline

Every display program, counted back from its in-store date.

Setline helps brand teams run retail display programs with their vendors: it generates key dates from the in-store date, tracks approvals, and shows whether each vendor is working, waiting on you, or backlogged.

## Status

Working today:

- Passwordless sign-in by email link, workspaces, invitations and six roles enforced on the server
- Programs dashboard, program detail, new program, and marking key dates done
- Lead-time profiles by vendor, origin and process that you can edit and save, with a live preview
- Team page with invitations
- Timeline engine and service layer with tests

Not built yet: approvals and proofs, vendor portal, guidelines, in-store tracker, integrations, and the multi-step create flow. See `docs/build-brief.md` for the plan.

## Run it

```bash
npm install
npm run dev
```

No setup is needed for development: the app uses an embedded database in `.data/` and shows the sign-in link on screen instead of emailing it.

## Deploy it

Set the variables in `.env.example` (`DATABASE_URL`, `APP_URL`, `RESEND_API_KEY`, `EMAIL_FROM`), then run `npm run db:migrate` once against the database before starting the app.

## Check it

```bash
npm test
npm run typecheck
npm run lint
npm run build
```
