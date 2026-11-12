import type { Db } from "@/lib/db/client";
import { leadTimeProfiles, memberships, programs, vendors, workspaces } from "@/lib/db/schema";
import type { UserRow } from "@/lib/db/schema";
import { todayInZone } from "@/lib/today";
import { InputError } from "./errors";
import { findMember } from "./member";
import { DEFAULT_STEPS, SAMPLE_PROFILES, SAMPLE_VENDORS, buildSamplePrograms } from "./sample";

export interface NewWorkspaceInput {
  name: string;
  timezone: string;
  withSamples: boolean;
}

function validTimezone(timezone: string): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return timezone;
  } catch {
    return "America/New_York";
  }
}

/** Creates a workspace with the person as its brand admin and a complete default lead-time profile. */
export async function createWorkspace(db: Db, user: UserRow, input: NewWorkspaceInput): Promise<void> {
  const name = input.name.trim();
  if (!name || name.length > 80) throw new InputError("Give your workspace a name of up to 80 characters.");
  if (await findMember(db, user)) throw new InputError("You already belong to a workspace.");
  const timezone = validTimezone(input.timezone);

  await db.transaction(async (tx) => {
    const [workspace] = await tx.insert(workspaces).values({ name, timezone }).returning();
    await tx.insert(memberships).values({ workspaceId: workspace.id, userId: user.id, role: "brandAdmin" });
    await tx.insert(leadTimeProfiles).values({ workspaceId: workspace.id, name: "Workspace default", isDefault: true, steps: DEFAULT_STEPS });
    if (!input.withSamples) return;

    const vendorIds = new Map<string, string>();
    for (const { key, ...vendor } of SAMPLE_VENDORS) {
      const [row] = await tx.insert(vendors).values({ workspaceId: workspace.id, ...vendor }).returning({ id: vendors.id });
      vendorIds.set(key, row.id);
    }
    for (const { vendorKey, ...profile } of SAMPLE_PROFILES) {
      await tx.insert(leadTimeProfiles).values({ workspaceId: workspace.id, ...profile, vendorId: vendorKey ? vendorIds.get(vendorKey) : null });
    }
    for (const { vendorKey, ...program } of buildSamplePrograms(todayInZone(timezone))) {
      await tx.insert(programs).values({ workspaceId: workspace.id, ownerId: user.id, ...program, vendorId: vendorKey ? vendorIds.get(vendorKey) : null });
    }
  });
}
