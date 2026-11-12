import Link from "next/link";
import { Suspense } from "react";
import { signOut } from "@/app/actions";
import { getCurrentMember } from "@/lib/auth/session";

const LINKS = [
  { href: "/programs", label: "Programs" },
  { href: "/settings/lead-times", label: "Lead times" },
  { href: "/settings/team", label: "Team" },
];

async function NavUser() {
  const member = await getCurrentMember();
  if (!member) return null;
  return (
    <form action={signOut} className="flex items-center gap-3">
      <span className="hidden text-[13px] text-muted sm:inline">{member.workspace.name} · {member.user.email}</span>
      <button type="submit" className="h-11 rounded-[10px] border-[1.5px] border-ink px-3.5 text-[13px] font-semibold">Sign out</button>
    </form>
  );
}

function Loading() {
  return (
    <div className="flex flex-col gap-4" role="status" aria-label="Loading">
      <div className="h-10 w-64 rounded-xl bg-line" />
      <div className="h-40 rounded-[18px] bg-surface" />
      <div className="h-64 rounded-[18px] bg-surface" />
    </div>
  );
}

/** Page frame for signed-in screens. The frame is static; everything that reads the session streams in inside it. */
export function AppShell({ active, children }: { active: string; children: React.ReactNode }) {
  return (
    <>
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-x-7 gap-y-3 px-6 py-3">
          <Link href="/programs" className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-accent" aria-hidden="true" />
            <span className="font-display text-[22px] font-bold tracking-tight">setline</span>
          </Link>
          <nav className="flex flex-1 flex-wrap gap-1 text-sm font-medium">
            {LINKS.map((link) => (
              <Link key={link.href} href={link.href} aria-current={active === link.href ? "page" : undefined}
                className={`rounded-[10px] px-3.5 py-3 ${active === link.href ? "bg-canvas font-semibold text-ink" : "text-muted hover:text-accent-text"}`}>
                {link.label}
              </Link>
            ))}
          </nav>
          <Suspense fallback={null}>
            <NavUser />
          </Suspense>
        </div>
      </header>
      <main className="mx-auto flex max-w-[1200px] flex-col gap-6 px-6 pt-8 pb-12">
        <Suspense fallback={<Loading />}>{children}</Suspense>
      </main>
    </>
  );
}

/** Centered card for sign-in and setup screens. */
export function AuthShell({ title, lead, children }: { title: string; lead: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-[480px] flex-col justify-center gap-6 px-6 py-12">
      <div className="flex items-center gap-2">
        <span className="h-3 w-3 rounded-full bg-accent" aria-hidden="true" />
        <span className="font-display text-[22px] font-bold tracking-tight">setline</span>
      </div>
      <div>
        <h1 className="font-display text-4xl font-bold tracking-tight">{title}</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted">{lead}</p>
      </div>
      <div className="rounded-[18px] border border-line bg-surface p-6">
        <Suspense fallback={<div className="h-32" role="status" aria-label="Loading" />}>{children}</Suspense>
      </div>
    </main>
  );
}
