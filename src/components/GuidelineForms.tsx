"use client";

import { useActionState, useState } from "react";
import { addGuidelineVersionAction, createGuidelineAction } from "@/app/actions";
import { FileField } from "./FileField";
import { FIELD, FormMessage, LABEL, SubmitButton } from "./forms";

export function NewGuidelineForm({ vendors, retailers }: { vendors: { id: string; name: string }[]; retailers: string[] }) {
  const [state, action] = useActionState(createGuidelineAction, {});
  const [type, setType] = useState("store");
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className={`${LABEL} flex-[1_1_170px]`}>
          Type
          <select name="type" value={type} onChange={(e) => setType(e.target.value)} className={FIELD}>
            <option value="store">Store guidelines</option>
            <option value="brand">Brand guidelines</option>
            <option value="vendor">Vendor guidelines</option>
          </select>
        </label>
        <label className={`${LABEL} flex-[2_1_260px]`}>
          Title
          <input name="title" required maxLength={160} className={FIELD} />
        </label>
        {type === "store" && (
          <label className={`${LABEL} flex-[1_1_200px]`}>
            Retailer
            <input name="retailer" required maxLength={120} list="guideline-retailers" className={FIELD} />
            <datalist id="guideline-retailers">{retailers.map((r) => <option key={r} value={r} />)}</datalist>
          </label>
        )}
        {type === "vendor" && (
          <label className={`${LABEL} flex-[1_1_200px]`}>
            Vendor
            <select name="vendorId" required defaultValue="" className={FIELD}>
              <option value="" disabled>Choose a vendor</option>
              {vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}
            </select>
          </label>
        )}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-[2_1_320px]"><FileField label="The file" required /></div>
        <label className={`${LABEL} flex-[1_1_130px]`}>
          Version label
          <input name="label" defaultValue="v1" required maxLength={40} className={FIELD} />
        </label>
        <label className={`${LABEL} flex-[1_1_170px]`}>
          <span>Review by <span className="font-normal text-muted">(optional)</span></span>
          <input name="reviewBy" type="date" className={FIELD} />
        </label>
        <SubmitButton variant="accent">Add guideline</SubmitButton>
      </div>
      <FormMessage state={state} />
    </form>
  );
}

export function AddVersionForm({ guidelineId, title }: { guidelineId: string; title: string }) {
  const [state, action] = useActionState(addGuidelineVersionAction, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="guidelineId" value={guidelineId} />
      <div className="flex flex-wrap items-end gap-3">
        <label className={`${LABEL} flex-[1_1_120px]`}>
          <span>New version label <span className="sr-only">for {title}</span></span>
          <input name="label" required maxLength={40} placeholder="v2" className={FIELD} />
        </label>
        <div className="flex-[2_1_320px]"><FileField label="The file" required /></div>
        <SubmitButton variant="outline">Add version</SubmitButton>
      </div>
      <FormMessage state={state} />
    </form>
  );
}
