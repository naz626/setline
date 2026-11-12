"use client";

import { useActionState } from "react";
import { addStoresAction, setStorePhotoAction } from "@/app/actions";
import { FileField } from "./FileField";
import { FIELD, FormMessage, LABEL, SubmitButton } from "./forms";

export function AddStoresForm({ programId }: { programId: string }) {
  const [state, action] = useActionState(addStoresAction, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="programId" value={programId} />
      <label className={LABEL}>
        Paste stores, one per line
        <textarea name="stores" required rows={5} placeholder={"1042, Austin TX\n1043, Dallas TX"} className={`${FIELD} h-auto py-2.5 font-normal`} />
      </label>
      <p className="text-[13px] text-muted">Start each line with the store number. Anything after a comma is kept as the location. You can paste a column straight from a spreadsheet.</p>
      <FormMessage state={state} />
      <SubmitButton variant="accent" className="self-start">Add stores</SubmitButton>
    </form>
  );
}

/** The photo that shows the display set up in the store. Adding one marks the store installed. */
export function StorePhotoForm({ storeId, storeNumber }: { storeId: string; storeNumber: string }) {
  const [state, action] = useActionState(setStorePhotoAction, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="storeId" value={storeId} />
      <FileField label={`Photo of the display in store ${storeNumber}`} required accept="image/*" />
      <FormMessage state={state} />
      <SubmitButton variant="outline" className="self-start">Save photo</SubmitButton>
    </form>
  );
}
