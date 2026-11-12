"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const STOPS = [
  { title: "Start with the in-store date", body: "Create a program, pick the date it has to be in store, and Setline counts every key date back from there using your lead times.", href: "/programs/new", link: "Start a program" },
  { title: "See what needs you today", body: "The Programs page puts late and at-risk programs first. Every status has a color, an icon and a label: On track, At risk, Will miss date.", href: "/programs", link: "Open Programs" },
  { title: "Know where your vendors are", body: "Vendors tap Working, Waiting on you or Backlogged from their own page. A backlog with a start date shows you the new in-store date straight away.", href: "/vendors", link: "Open Vendors" },
  { title: "Approve, and track every change", body: "Quotes and proofs keep every version. Log a change at any point up to shipping, reopen the approvals it affects, and see when the vendor has confirmed it.", href: "/approvals", link: "Open Approvals" },
  { title: "Follow it into the store", body: "The Timeline shows every program against today. Each program's store rollout tracks shipped, delivered and installed, with a photo to confirm.", href: "/timeline", link: "Open Timeline" },
];
const SEEN = "setline.tour.seen";

/** A five-stop introduction. It opens by itself the first time, and from the button after that. */
export function Tour({ autoStart }: { autoStart: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [stop, setStop] = useState(0);

  useEffect(() => {
    if (!autoStart) return;
    try {
      if (window.localStorage.getItem(SEEN)) return;
      window.localStorage.setItem(SEEN, "1");
    } catch {
      return;
    }
    dialog.current?.showModal();
  }, [autoStart]);

  const current = STOPS[stop];
  const last = stop === STOPS.length - 1;
  const close = () => dialog.current?.close();

  return (
    <>
      <button type="button" onClick={() => { setStop(0); dialog.current?.showModal(); }} className="h-12 rounded-xl border-[1.5px] border-ink px-5 text-sm font-semibold">Take the tour</button>
      <dialog ref={dialog} aria-labelledby="tour-title" className="m-auto w-[min(92vw,520px)] rounded-[18px] border border-line bg-surface p-0 text-ink backdrop:bg-ink/50">
        <div className="flex flex-col gap-4 p-6 sm:p-7">
          <p className="text-[13px] font-semibold text-muted" aria-live="polite">Stop {stop + 1} of {STOPS.length}</p>
          <div className="flex gap-1.5" aria-hidden="true">
            {STOPS.map((s, i) => <span key={s.title} className={`h-1.5 flex-1 rounded-full ${i <= stop ? "bg-accent" : "bg-line"}`} />)}
          </div>
          <h2 id="tour-title" className="font-display text-2xl font-bold tracking-tight">{current.title}</h2>
          <p className="text-[15px] leading-relaxed">{current.body}</p>
          <Link href={current.href} onClick={close} className="inline-block self-start py-2.5 text-sm font-semibold underline hover:text-accent-text">{current.link}</Link>
          <div className="flex flex-wrap justify-between gap-3 border-t border-line pt-4">
            <button type="button" onClick={close} className="h-12 rounded-xl px-3 text-sm font-semibold text-muted underline">{last ? "Close" : "Skip the tour"}</button>
            <div className="flex gap-3">
              {stop > 0 && <button type="button" onClick={() => setStop(stop - 1)} className="h-12 rounded-xl border-[1.5px] border-ink px-5 text-sm font-semibold">Back</button>}
              {last
                ? <button type="button" onClick={close} className="h-12 rounded-xl bg-ink px-5 text-sm font-semibold text-white">Done</button>
                : <button type="button" onClick={() => setStop(stop + 1)} className="h-12 rounded-xl bg-ink px-5 text-sm font-semibold text-white">Next</button>}
            </div>
          </div>
        </div>
      </dialog>
    </>
  );
}
