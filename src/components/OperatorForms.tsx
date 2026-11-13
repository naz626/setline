"use client";

import { useActionState } from "react";
import { operatorAction } from "@/app/actions";
import { FIELD, FormMessage, SubmitButton } from "./forms";

export function OperatorControls({ workspaceId, name, plan, founding, canExtend }: { workspaceId: string; name: string; plan: string; founding: boolean; canExtend: boolean }) {
  const [state, action] = useActionState(operatorAction, {});
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <form action={action} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="workspaceId" value={workspaceId} />
          <input type="hidden" name="intent" value="plan" />
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            <span>Plan<span className="sr-only"> for {name}</span></span>
            <select name="plan" defaultValue={plan} className={FIELD.replace("w-full", "w-40")}>
              <option value="trial">Free trial</option>
              <option value="starter">Starter</option>
              <option value="team">Team</option>
              <option value="enterprise">Enterprise</option>
            </select>
          </label>
          <SubmitButton variant="outline">Set plan</SubmitButton>
        </form>
        {canExtend && (
          <form action={action}>
            <input type="hidden" name="workspaceId" value={workspaceId} />
            <input type="hidden" name="intent" value="extend" />
            <SubmitButton variant="outline">Extend trial 14 days<span className="sr-only"> for {name}</span></SubmitButton>
          </form>
        )}
        <form action={action}>
          <input type="hidden" name="workspaceId" value={workspaceId} />
          <input type="hidden" name="intent" value="founding" />
          <input type="hidden" name="founding" value={founding ? "off" : "on"} />
          <SubmitButton variant="outline">{founding ? "Remove founding offer" : "Give founding offer"}<span className="sr-only"> for {name}</span></SubmitButton>
        </form>
      </div>
      <FormMessage state={state} />
    </div>
  );
}
