# Setline: build brief for Claude Code

Setline is a web app for brand teams that run retail display programs. A brand submits a display program to a vendor, Setline counts every key date back from the in-store date, and everyone can see approvals, vendor state and risk at a glance. Users are visual and art-direction people, so the product is colorful, simple and guided.

This brief is the starting point for the build. Where it says "assumption" or "open decision", confirm with the product owner before building on it.

## References

- Screens (clickable prototype, 17 artboards): https://claude.ai/artifact/Fu9QPNtHdyj5Rt7qGTX6rm
- Workflow and screen map (roles, flows, rules): https://claude.ai/artifact/8JYbJvCrRcj52odZ72vKp4
- Name and color boards: https://claude.ai/artifact/GuiBX4JJtffbbubUq4rwLq

The artifact links are private to the owner. If you cannot open them, ask for screenshots or exports; do not guess the layouts.

## Recommended stack (assumption, not yet confirmed)

- Next.js (App Router) with TypeScript
- PostgreSQL with Drizzle
- Sign-in by emailed link with invitations, sessions stored in the database
- Tailwind CSS driven by the design tokens below
- S3-compatible object storage for artwork, proofs, guidelines and store photos
- Background jobs for recalculation, reminders and integration syncs
- Vitest for the timeline engine, Playwright for the core flows

## Design tokens (Gallery palette)

| Token | Hex | Use |
| --- | --- | --- |
| canvas | #F7F4EF | Page background |
| surface | #FFFFFF | Cards, tables |
| line | #E4DED4 | Hairlines |
| control-border | #857E73 | Input and unselected control borders |
| ink | #1C1A17 | Text, primary buttons |
| muted | #6B645B | Secondary text |
| accent | #F2542D | Logo mark and the main create action, always with ink text |
| accent-text | #C23A17 | Coral used as text or link hover |

Status colors. Each status has a pill text color, a pill tint and a solid dot color. Every status also carries an icon and a label; color is never the only signal.

| Status | Text | Tint | Dot |
| --- | --- | --- | --- |
| On track | #14633F | #DDF1E5 | #1A8F58 |
| At risk | #7A4B00 | #FCEBC7 | #B07A00 |
| Will miss date | #9B1C1C | #FADDDB | #D6322E |
| Complete | #1B4FA8 | #DCE7FA | #2459C7 |
| Not started | #55504A | #EAE6DF | #857E73 |
| Working | #0B5E5C | #D5F0EE | #0E8E8A |
| Waiting on you | #5B2FC2 | #E8E0FA | #9B6AF0 |
| Backlogged | #8F1D57 | #F8DCEA | #B3266F |

Type: Space Grotesk 700 for headings and dates, Inter 400/500/600 for everything else. Radii: 10 to 12 px controls, 16 to 18 px cards, full pills. Touch targets at least 44 px. Text contrast at least 4.5:1, non-text at least 3:1.

## Roles

| Role | Can | Cannot |
| --- | --- | --- |
| Brand admin | Everything: members, vendors, guidelines, integrations, billing | n/a |
| Program manager | Create programs, submit to vendors, set dates, approve or reject | Change workspace settings or billing |
| Designer | Upload artwork, respond to comments, edit guidelines | Change dates or vendor assignments |
| Reviewer | View, comment, approve at assigned stages | Edit program details |
| Vendor guest | Update their status, upload proofs and photos, see assigned programs | See other vendors or other programs |
| Retailer guest | View status and in-store dates, give retailer approval, add store photos | Edit anything but their own approval |

Enforce these on the server, not only in the UI. Vendor and retailer guests are scoped to the programs they are assigned to.

## Data model (first pass)

- Workspace: name, logo
- User, Membership (user, workspace, role), Invitation
- Vendor: name, capabilities, source (added by brand or directory), origin (domestic or overseas), process
- LeadTimeProfile: name, scope (vendor, origin, process, display type, all optional), duration per step (days and unit)
- ProgramLeadTimeOverride: program, step, days, unit
- VendorContact: links a vendor guest user to a vendor
- Retailer: name
- Program: name, retailer, display type, store count, in-store date (target), projected in-store date, stage, health, vendor, owner
- Milestone: program, type, due date, owner side (brand or vendor), duration, completed at, sort order
- VendorStatus: program, state (Working, Waiting on you, Backlogged), note, expected start date, set by, set at (keep history)
- Approval: program, milestone, kind (quote, structural proof, print proof, sample photos, retailer sign-off), approver, due date, decision, decided at
- Proof: approval, version, file, source (upload or integration), uploaded by
- Comment: proof, author, body, pin x and y (optional)
- Guideline: type (store, brand, vendor), title, retailer or vendor link, review-by date
- GuidelineVersion: guideline, version label, file, uploaded at
- ProgramGuideline: program, guideline
- ProgramFile: program, kind (artwork, specs, quantities, ship-to), file, source
- Store: retailer, store number, region, address
- StoreRollout: program, store, shipped at, delivered at, installed at, photo, photo confirmed at
- IntegrationConnection: provider, status, config; SyncEvent: connection, time, summary
- ActivityEvent: program, actor, type, payload, time
- NotificationPreference: user, rule, enabled

## Lifecycle and status rules

Stages, in order: Plan, Submit, Approve, Produce, Ship, In store.

Program health:
- Not started: in planning, no vendor assigned yet
- On track: all milestones on or ahead of plan
- At risk: a milestone is within 3 working days of slipping, or an approval is overdue
- Will miss date: the recalculated in-store date falls after the target
- Complete: the program is in store and verified

Vendor state is set by the vendor (or inferred): Working, Waiting on you, Backlogged. "Waiting on you" is also set by the system when a brand approval is overdue. A Backlogged status carries an expected start date.

## Timeline engine

This is the core of the product. Build it as a pure, well-tested module.

1. Input: the in-store date and a list of milestone durations.
2. Schedule every milestone backward from the in-store date. Keep deadlines on working days when that option is on.
3. When a milestone slips, an approval is late, or a vendor reports Backlogged with a start date, recalculate forward from that point to get the projected in-store date.
4. Compare projected with target and update health using the rules above.
5. Record an activity event and send notifications when health or the projected date changes.
6. Offer the two responses shown on the Timeline screen: move the in-store date to the projected date, or choose another vendor.

### Lead times are adjustable, never fixed

Lead times vary by vendor, by where the display is made (domestic or overseas), and by process. They are stored as lead-time profiles and resolved per program:

1. Start with the workspace default profile, which must set every step.
2. Layer every profile whose scope matches the program, broadest first: display type, then origin, then process, then vendor.
3. Apply any step the user changed on that one program.

Each step is a number of days in either working or calendar days (transit is usually calendar). The UI always shows where a number came from. Admins and program managers can edit profiles; a program's own lead times can be changed in the create flow and on the program page. Changing a lead time recalculates that program's dates.

This is already implemented in `src/lib/timeline` (`resolveLeadTimes`, `scheduleBackward`, `projectForward`, `computeHealth`) with tests, and previewed at `/settings/lead-times`. Saving edits needs the database.

Default milestones and durations used in the sample data. These are placeholders, not confirmed industry values:

| Milestone | Owner | Time allowed |
| --- | --- | --- |
| Submit to vendor | Brand | Start of the clock |
| Vendor quote approved | Brand | 1 week |
| Structural proof approved | Brand | 2 weeks |
| Print proof approved | Brand | 2 weeks |
| Production complete | Vendor | 4 weeks |
| Ships to stores | Vendor | 2 days |
| In store | Target | 12 days for transit and store set |

## What is already built

- Next.js and TypeScript project with the Gallery tokens, status pills and stage bar
- Timeline engine and lead-time profiles, with unit tests
- Postgres schema and migrations with Drizzle (`src/lib/db`), with an embedded database for development
- Passwordless email sign-in with database sessions, workspaces, invitations, and the six roles checked on the server (`src/lib/auth`, `src/lib/services`)
- `/programs`, `/programs/new`, `/programs/:id` (with "mark done" on the next key date), `/settings/lead-times` (saved edits), `/settings/team`
- New workspaces can start with sample programs placed around today's date
- Vendors: `/vendors` (add vendors, invite contacts, see status by vendor) and the vendor portal at `/vendor` with one-tap status, status history, and "mark done" for production and shipping. Vendor guests are sent to `/vendor` from every brand screen.
- Approvals: quote, structural proof and print proof versions as https links, approve or request changes, comments, the `/approvals` board and `/approvals/:id` review. Approving the next approval completes that key date.
- `/timeline` across open programs, with "move the in-store date" and "choose another vendor" on a late program's page
- `/guidelines` library with versions. Store guidelines attach by retailer name, vendor guidelines by vendor, brand guidelines to every program.
- `/programs/:id/stores`: paste a store list, then mark shipped, delivered and installed per store or all at once
- `/settings/integrations`: an honest list of what works today (pasted store lists, file links) and which connections are planned. Nothing connects yet.

- `/programs/new` is a five-step flow (basics, vendor, files, dates, submit) with a live key-date preview and lead times that can be changed for that one program. A program saved as a plan stays hidden from the vendor until it is submitted.
- Program files (artwork, specs, quantities, ship-to) as https links, shown to the vendor in their portal
- An activity log on every program, written by the services in the same transaction as each change
- Email notifications (`src/lib/services/notices.ts`, sent from `announce` in `src/app/actions.ts`): the vendor's contacts hear about a submitted program and proof decisions, the program owner hears when the vendor sets a status, and reviewers hear about a new proof. There are no per-person preferences yet.
- Changes at any point: a new quote or proof version can be sent until the program ships (it replaces a waiting version, or reopens an approval already given). `/programs/:id` has a Changes log (`src/lib/services/changes.ts`): each change has a category and description, can reopen approvals, emails the vendor, and stays "not seen" until the vendor taps "Got it". A reopened approval takes its key date back and holds up the remaining dates in the engine.
- Fixing mistakes: the most recent key date can be marked as not done, any completed date can be corrected, and details, the in-store date and the program's own lead times can be edited at any time. Every edit is written to the activity log with before and after values.

- File uploads to a private Vercel Blob store (`src/components/FileField.tsx`, `/api/upload`, `/files/:kind/:id`). A file column holds either an https link or `blob:<path>`; uploads are only accepted from the workspace's own folder and are served through the app after an access check on the record they belong to. Without `BLOB_READ_WRITE_TOKEN` the upload button is hidden and links still work.
- Install photo per store (adds the photo and marks the store installed) and a retailer sign-off on each program
- `/settings/notifications`: each person chooses which emails they get
- Guided tour (`src/components/Tour.tsx`): five stops, opens once per browser on the Programs page, replayable from "Take the tour"
- Integrations that work today: Slack or Teams incoming-webhook alerts, a secret calendar feed at `/calendar/<secret>.ics`, and pasting programs from a spreadsheet

- Plans and trial (`src/lib/plans.ts`, `src/lib/services/billing.ts`): every workspace starts on a 30-day trial with Team features. When it ends the workspace is read-only (`assertWritable`, called from the action helpers `attempt` and `quietly` and from the upload route). Starter caps brand seats at 5 and open programs at 15; guests are never counted. Alerts and the calendar feed need Team or a trial.
- `/settings/billing` shows the trial, usage and plans. There is no card checkout: an operator sets the plan by hand at `/operator`, which only people listed in `SETLINE_OPERATOR_EMAILS` can open. Operators can also give the one 14-day trial extension and the founding offer (10 places).
- Trial reminder emails on day 20 and day 28, sent by a daily Vercel cron (`vercel.json`, `/api/cron/trial-reminders`, protected by `CRON_SECRET`).

Still not built: card checkout (Stripe), pinned comments on proofs, sample-photo approvals, and connections that need a partner or an OAuth app: Esko WebCenter, PageProof, Asana, Smartsheet, monday.com, Drive, Dropbox, OneDrive, EDI ship notices and carrier tracking.

A trial workspace that stays unpaid is deleted 60 days after it ends (`DATA_RETENTION_DAYS` in `src/lib/plans.ts`), with one warning email 7 days before that (`DELETION_WARNING_DAYS`). `/api/cron/delete-expired` runs daily (see `vercel.json`), calling `dueForDeletionWarning`/`markDeletionWarned` then `dueForDeletion`/`deleteWorkspace` in `src/lib/services/billing.ts`. Deleting a workspace deletes its uploaded files from storage (best-effort) and then the workspace row, which cascades to every table that references it — programs, vendors, guidelines, members and all. Extending a trial resets the warning, since it pushes the deletion clock out too. Paying before the cutoff removes the workspace from both queries, since they only ever look at `plan = "trial"`.

Storage is now enforced per plan. A new `uploads` table (`src/lib/db/schema.ts`) records every finished upload's size against its workspace (set in the upload route's `onUploadCompleted`, by calling `head()` on the blob to get its size — the client completion event itself doesn't carry one). `assertStorageAvailable` in `src/lib/services/storage.ts` refuses a new upload once a workspace is at or over its plan's `storageGb`; `storageUsedBytes` sums the table and is shown on the billing page. Removing a file (`removeProgramFile`, `removeStorePhoto`/replacing a photo, `deleteGuideline`) calls `forgetUpload`, which deletes the blob itself (best-effort) and drops the accounting row, so removing a file actually frees the space it used. Plain `https://` links were never ours to store, so they are never counted and `forgetUpload` is a no-op for them.

Retailer guests are now scoped: a membership or invitation carries a `retailer` name (set when the brand invites them), and `visibleTo` in `src/lib/services/programs.ts` only shows that retailer guest programs whose `retailer` matches (case-insensitively) and that have been submitted — the same shape as vendor-guest scoping by `vendorId`.

Decisions made while building, which differ from the first draft of this brief:

- Drizzle instead of Prisma, because it runs the same schema on hosted Postgres and on the embedded development database with no extra services
- Sign-in is implemented in the project (about 100 lines in `src/lib/auth/core.ts`) instead of Auth.js, whose current major version is still in beta. It can be swapped for a library later without touching the services.
- Milestone completion dates are stored on the program for now and move to their own table when approvals are built
- A person belongs to one workspace for now

Not verified yet: a real hosted Postgres (only the embedded one has been run) and real email delivery through Resend.

## Screens and routes

| Route | Screen | Prototype artboard |
| --- | --- | --- |
| /programs | Dashboard | 1 · Dashboard |
| /programs/new (5 steps) | New program: basics, vendor, files, dates, submit | New program 1 to 5 |
| /programs/:id | Program detail | 2 · Program detail |
| /programs/:id/stores | In-store tracker | 8 · In-store tracker |
| /timeline | Timeline across programs | 3 · Timeline |
| /approvals | Approvals board | 5 · Approvals board |
| /approvals/:id | Proof review | 6 · Proof review |
| /vendors | Vendor status and vendor list | 4 · Vendor status |
| /guidelines | Guidelines library | 7 · Guidelines library |
| /settings/team | Team and settings | 11 · Team and settings |
| /settings/integrations | Integrations | 10 · Integrations |
| /welcome | First run | 12 · First run |
| /vendor | Vendor portal (vendor guests only) | 9 · Vendor portal |

The guided tour is a five-stop overlay that starts from the first-run screen and the "Take the tour" button, runs on sample programs, and can be replayed.

## Build phases

Phase 1, core loop (build this first):
1. Project setup, tokens, shared components (status pill, stage bar, cards, buttons, form fields)
2. Auth, workspace, invitations and roles
3. Programs: create flow, detail page, dashboard with filters
4. Timeline engine with tests, key dates on the program, timeline view
5. Vendors: list, invite by email, vendor portal with one-tap status
6. Approvals: upload proof versions, approve or request changes, comments, approvals board
7. Guidelines library with versions and program links
8. Notifications by email, activity feed
9. CSV import for programs, vendors and store lists
10. Seed data matching the prototype's sample programs

Phase 2:
- In-store tracker with photo confirmation and retailer guest view
- Slack or Teams alerts, calendar feeds
- File pickers for Google Drive, Dropbox, OneDrive
- Asana, Smartsheet and monday.com import and date sync
- PageProof proof status sync
- Vendor directory

Phase 3:
- Esko WebCenter integration. API access is gated and likely needs a partnership, so design the proof and approval model to accept an external source now, and build the connector when access is confirmed.
- EDI 856 ship notices and carrier tracking
- Bynder, Brandfolder and Workfront connectors

## Acceptance checks for phase 1

- Creating a program with an in-store date produces the full set of key dates, all on working days.
- Marking an approval late turns the program At risk; a slip that pushes past the target turns it Will miss date and shows the projected date.
- A vendor guest can set Working, Waiting on you or Backlogged, and the brand sees it without refreshing more than once.
- A vendor guest cannot load any program or vendor they are not assigned to.
- Every status renders with icon, label and color, and passes the contrast targets above.
- The dashboard, program detail, timeline and approvals board work at phone width.

## Open decisions

- The real numbers for the workspace default and each vendor, origin and process profile
- Whether a program can be submitted while a required item (for example ship-to details) is missing
- Whether vendor guest access is free
- Retailer guidelines attach by matching the retailer name on the program. Decide whether retailers should become their own records.
- Retailer guests can currently see every program in the workspace (but no proofs). Decide how they are assigned to programs.
- Hosting, database host, email sender address and file storage choices
- The name Setline still needs trademark and domain clearance
