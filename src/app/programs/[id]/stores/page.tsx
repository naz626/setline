import Link from "next/link";
import { notFound } from "next/navigation";
import { markAllStoresAction, markStoreAction, removeStoreAction, resetStoreAction } from "@/app/actions";
import { AppShell } from "@/components/AppShell";
import { StatusIcon, StatusPill } from "@/components/StatusPill";
import { AddStoresForm } from "@/components/StoreForms";
import { can } from "@/lib/auth/permissions";
import { requireMember } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { getProgramView } from "@/lib/services/programs";
import { STORE_STEPS, STORE_STEP_LABELS, listStores, storeStep } from "@/lib/services/stores";
import type { StoreStep } from "@/lib/services/stores";
import { STORE_STYLES } from "@/lib/status";
import type { StoreStatusKey } from "@/lib/status";
import { formatLong, formatShort } from "@/lib/timeline";

const CARD = "rounded-[18px] border border-line bg-surface px-6 py-5";
const SMALL = "h-11 rounded-[10px] px-3.5 text-[13px] font-semibold";

async function Stores({ params }: { params: Promise<{ id: string }> }) {
  const member = await requireMember();
  const { id } = await params;
  const db = await getDb();
  const view = await getProgramView(db, member, id);
  if (!view) notFound();
  const { program } = view;
  const stores = await listStores(db, member, program.id);
  const role = member.membership.role;
  const canManage = can(role, "stores.manage");
  const canUpdate = can(role, "stores.update");
  const vendorSide = role === "vendorGuest";
  const count = (key: StoreStatusKey) => stores.filter((s) => (storeStep(s) ?? "notShipped") === key).length;
  const rank = (step: StoreStep | undefined) => (step ? STORE_STEPS.indexOf(step) : -1);
  const reached = (step: StoreStep) => stores.filter((s) => rank(storeStep(s)) >= rank(step)).length;
  const installed = reached("installed");

  return (
    <>
      <div className="flex flex-col gap-3">
        <div className="text-[13px] text-muted">
          {vendorSide ? <Link href="/vendor" className="inline-block py-3 hover:text-accent-text">Your programs</Link> : (
            <><Link href="/programs" className="inline-block py-3 hover:text-accent-text">Programs</Link> / <Link href={`/programs/${program.id}`} className="inline-block py-3 hover:text-accent-text">{program.name}</Link></>
          )} / Stores
        </div>
        <h1 className="font-display text-4xl font-bold tracking-tight">Store rollout</h1>
        <p className="text-sm text-muted">{program.name} · in store <strong className="font-semibold text-ink">{formatLong(program.inStoreDate)}</strong></p>
      </div>

      {stores.length > 0 && (
        <>
          <section className={CARD} aria-label="Progress">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-display text-xl font-bold">{installed} of {stores.length} {stores.length === 1 ? "store" : "stores"} installed</h2>
              <span className="text-[13px] text-muted">{Math.round((installed / stores.length) * 100)}%</span>
            </div>
            <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-line" aria-hidden="true">
              {(["installed", "delivered", "shipped"] as const).map((key) => (
                <span key={key} style={{ width: `${(count(key) / stores.length) * 100}%`, background: STORE_STYLES[key].dot }} />
              ))}
            </div>
            <ul className="mt-4 flex flex-wrap gap-3">
              {(["notShipped", "shipped", "delivered", "installed"] as const).map((key) => (
                <li key={key} className="flex flex-[1_1_150px] flex-col gap-1 rounded-[14px] p-4" style={{ background: STORE_STYLES[key].tint }}>
                  <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: STORE_STYLES[key].text }}><StatusIcon style={STORE_STYLES[key]} size={14} />{STORE_STYLES[key].label}</span>
                  <span className="font-display text-2xl font-bold">{count(key)}</span>
                </li>
              ))}
            </ul>
          </section>

          {canUpdate && (
            <section className={`${CARD} flex flex-col gap-3`}>
              <h2 className="font-display text-xl font-bold">Update every store at once</h2>
              <p className="text-sm text-muted">Marks all stores that have not reached that step yet, dated today.</p>
              <div className="flex flex-wrap gap-2.5">
                {STORE_STEPS.map((step) => (
                  <form key={step} action={markAllStoresAction}>
                    <input type="hidden" name="programId" value={program.id} />
                    <input type="hidden" name="step" value={step} />
                    <button type="submit" disabled={reached(step) === stores.length} className="h-12 rounded-xl border-[1.5px] border-ink px-5 text-sm font-semibold disabled:border-line disabled:text-muted">
                      Mark all {STORE_STEP_LABELS[step].toLowerCase()}
                    </button>
                  </form>
                ))}
              </div>
            </section>
          )}

          <section className={CARD}>
            <h2 className="font-display text-xl font-bold">Stores</h2>
            <ul className="mt-2">
              {stores.map((store) => {
                const step = storeStep(store);
                const nextStep = STORE_STEPS[step ? STORE_STEPS.indexOf(step) + 1 : 0];
                const dates = [store.shippedOn && `Shipped ${formatShort(store.shippedOn)}`, store.deliveredOn && `delivered ${formatShort(store.deliveredOn)}`, store.installedOn && `installed ${formatShort(store.installedOn)}`].filter(Boolean).join(", ");
                return (
                  <li key={store.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line py-3 last:border-b-0">
                    <div className="flex-[1_1_220px]">
                      <div className="text-[15px] font-semibold">Store {store.storeNumber}</div>
                      <div className="text-[13px] text-muted">{[store.location, dates].filter(Boolean).join(" · ") || "No updates yet"}</div>
                    </div>
                    <StatusPill style={STORE_STYLES[step ?? "notShipped"]} />
                    <div className="flex flex-wrap gap-2">
                      {canUpdate && nextStep && (
                        <form action={markStoreAction}>
                          <input type="hidden" name="storeId" value={store.id} />
                          <input type="hidden" name="step" value={nextStep} />
                          <button type="submit" className={`${SMALL} bg-ink text-white`}>Mark {STORE_STEP_LABELS[nextStep].toLowerCase()}<span className="sr-only">: store {store.storeNumber}</span></button>
                        </form>
                      )}
                      {canManage && step && (
                        <form action={resetStoreAction}>
                          <input type="hidden" name="storeId" value={store.id} />
                          <button type="submit" className={`${SMALL} border-[1.5px] border-ink`}>Undo<span className="sr-only"> progress for store {store.storeNumber}</span></button>
                        </form>
                      )}
                      {canManage && !step && (
                        <form action={removeStoreAction}>
                          <input type="hidden" name="storeId" value={store.id} />
                          <button type="submit" className={`${SMALL} border-[1.5px] border-control text-muted`}>Remove<span className="sr-only"> store {store.storeNumber}</span></button>
                        </form>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      )}

      {stores.length === 0 && (
        <section className="rounded-[18px] border border-dashed border-control bg-surface p-8">
          <h2 className="font-display text-xl font-bold">No stores on the list yet</h2>
          <p className="mt-2 text-sm text-muted">{canManage ? "Paste the store list below to track shipping, delivery and installation store by store." : "The brand has not added the store list yet."}</p>
        </section>
      )}

      {canManage && (
        <section className={CARD}>
          <h2 className="mb-3 font-display text-xl font-bold">Add stores</h2>
          <AddStoresForm programId={program.id} />
        </section>
      )}
    </>
  );
}

export default function StoresPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <AppShell active="/programs">
      <Stores params={params} />
    </AppShell>
  );
}
