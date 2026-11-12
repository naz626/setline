import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { OperatorControls } from "@/components/OperatorForms";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { FOUNDING_PLACES } from "@/lib/plans";
import { isOperator, listWorkspacesForOperator } from "@/lib/services/billing";

const DATE = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

/** For the people who run Setline: every workspace's plan, set by hand until card checkout exists. */
async function Operator() {
  const user = await requireUser();
  // Looks like any other missing page to everyone else.
  if (!isOperator(user.email)) notFound();
  const rows = await listWorkspacesForOperator(await getDb(), user.email);
  const founding = rows.filter((r) => r.workspace.founding).length;
  return (
    <>
      <div>
        <h1 className="font-display text-4xl font-bold tracking-tight">Workspaces</h1>
        <p className="mt-1.5 text-[15px] text-muted">{rows.length} {rows.length === 1 ? "workspace" : "workspaces"} · {founding} of {FOUNDING_PLACES} founding places used. Set a plan here once a customer has paid.</p>
      </div>
      {rows.map(({ workspace, usage, admins, state }) => (
        <section key={workspace.id} className="flex flex-col gap-3 rounded-[18px] border border-line bg-surface px-6 py-5">
          <div>
            <h2 className="font-display text-xl font-bold">{workspace.name}</h2>
            <p className="mt-1 text-sm text-muted">
              {state.plan.name}{state.status === "trialing" ? `, ${state.trialDaysLeft} days left (ends ${DATE.format(workspace.trialEndsAt)})` : state.status === "expired" ? `, ended ${DATE.format(workspace.trialEndsAt)}, read-only` : ""}
              {workspace.founding ? " · founding offer" : ""} · {usage.seats} seats · {usage.openPrograms} open programs · created {DATE.format(workspace.createdAt)}
            </p>
            <p className="text-[13px] text-muted">Admins: {admins.join(", ") || "none"}</p>
          </div>
          <OperatorControls workspaceId={workspace.id} name={workspace.name} plan={workspace.plan} founding={workspace.founding} canExtend={workspace.plan === "trial" && !workspace.trialExtended} />
        </section>
      ))}
    </>
  );
}

export default function OperatorPage() {
  return (
    <AppShell active="/operator">
      <Operator />
    </AppShell>
  );
}
