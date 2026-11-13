"use client";

import { useActionState, useState } from "react";
import { inviteAction } from "@/app/actions";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import type { Role } from "@/lib/db/schema";
import { FIELD, FormMessage, LABEL, SubmitButton } from "./forms";

const ROLES = Object.keys(ROLE_LABELS) as Role[];

export function InviteForm({ vendors }: { vendors: { id: string; name: string }[] }) {
  const [state, action] = useActionState(inviteAction, {});
  const [role, setRole] = useState<Role>("designer");
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className={`${LABEL} flex-[2_1_260px]`}>
          Invite by email
          <input name="email" type="email" required placeholder="name@company.com" className={FIELD} />
        </label>
        <label className={`${LABEL} flex-[1_1_180px]`}>
          Role
          <select name="role" value={role} onChange={(e) => setRole(e.target.value as Role)} className={FIELD}>
            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
        </label>
        {role === "vendorGuest" && (
          <label className={`${LABEL} flex-[1_1_200px]`}>
            Their vendor
            <select name="vendorId" required defaultValue="" className={FIELD}>
              <option value="" disabled>Choose a vendor</option>
              {vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}
            </select>
          </label>
        )}
        {role === "retailerGuest" && (
          <label className={`${LABEL} flex-[1_1_200px]`}>
            Their retailer
            <input name="retailer" required placeholder="e.g. Target" className={FIELD} />
          </label>
        )}
        <SubmitButton variant="accent">Send invite</SubmitButton>
      </div>
      <FormMessage state={state} />
    </form>
  );
}
