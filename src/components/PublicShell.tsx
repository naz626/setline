import Link from "next/link";
import { supportEmail } from "@/lib/support";

const LINK = "inline-flex min-h-11 items-center px-2 text-sm font-semibold text-muted hover:text-accent-text";

/** Frame for pages anyone can read, signed in or not. Nothing here reads the session. */
export function PublicShell({ children }: { children: React.ReactNode }) {
  const support = supportEmail();
  return (
    <>
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-[1100px] flex-wrap items-center gap-x-4 gap-y-2 px-6 py-3">
          <Link href="/" className="flex min-h-11 items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-accent" aria-hidden="true" />
            <span className="font-display text-[22px] font-bold tracking-tight">setline</span>
          </Link>
          <nav aria-label="Site" className="ml-auto flex items-center gap-1">
            <Link href="/pricing" className={LINK}>Pricing</Link>
            <Link href="/sign-in" className={LINK}>Sign in</Link>
            <Link href="/sign-in" className="inline-flex h-11 items-center rounded-xl bg-ink px-4 text-sm font-semibold text-white">Start free trial</Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto flex max-w-[1100px] flex-col gap-10 px-6 pt-10 pb-16">{children}</main>
      <footer className="border-t border-line bg-surface">
        <div className="mx-auto flex max-w-[1100px] flex-wrap items-center gap-x-4 gap-y-1 px-6 py-5 text-sm text-muted">
          <span>Setline</span>
          <nav aria-label="Legal" className="ml-auto flex flex-wrap items-center gap-1">
            <Link href="/pricing" className={LINK}>Pricing</Link>
            <Link href="/security" className={LINK}>Security</Link>
            <Link href="/terms" className={LINK}>Terms</Link>
            <Link href="/privacy" className={LINK}>Privacy</Link>
            {support && <a href={`mailto:${support}`} className={LINK}>{support}</a>}
          </nav>
        </div>
      </footer>
    </>
  );
}

/** A readable column for legal and policy text. */
export function Prose({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <article className="mx-auto flex w-full max-w-[720px] flex-col gap-4 text-[15px] leading-relaxed [&_h2]:mt-4 [&_h2]:font-display [&_h2]:text-2xl [&_h2]:font-bold [&_li]:ml-5 [&_li]:list-disc [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1.5 [&_a]:font-semibold [&_a]:underline">
      <h1 className="font-display text-4xl font-bold tracking-tight">{title}</h1>
      <p className="text-sm text-muted">Last updated {updated}</p>
      {children}
    </article>
  );
}
