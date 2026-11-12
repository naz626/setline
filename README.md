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
- Vendors and a vendor portal where a vendor's contact sets status in one tap
- Quote and proof approvals with versions and comments, a timeline across programs, a guidelines library, and a store-by-store rollout tracker

- A five-step create flow, program files as links, an activity log per program, and email notifications

Not built yet: file uploads (files are links for now), notification preferences, and third-party integrations. See `docs/build-brief.md` for the plan.

## Run it

```bash
npm install
npm run dev
```

No setup is needed for development: the app uses an embedded database in `.data/` and shows the sign-in link on screen instead of emailing it.

## Deploy it

Set the variables in `.env.example`. `npm run build` applies database migrations first whenever `DATABASE_URL` is set, so a host such as Vercel creates and updates the tables on every deploy. To apply them by hand, run `npm run db:migrate`.

## Check it

```bash
npm test
npm run typecheck
npm run lint
npm run build
```
