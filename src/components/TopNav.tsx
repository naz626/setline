import Link from "next/link";

const LINKS = [
  { href: "/programs", label: "Programs" },
  { href: "/settings/lead-times", label: "Lead times" },
];

export function TopNav({ active }: { active: string }) {
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-x-7 gap-y-3 px-6 py-3">
        <Link href="/programs" className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-accent" aria-hidden="true" />
          <span className="font-display text-[22px] font-bold tracking-tight">setline</span>
        </Link>
        <nav className="flex flex-1 flex-wrap gap-1 text-sm font-medium">
          {LINKS.map((link) => (
            <Link key={link.href} href={link.href}
              aria-current={active === link.href ? "page" : undefined}
              className={`rounded-[10px] px-3.5 py-3 ${active === link.href ? "bg-canvas font-semibold text-ink" : "text-muted hover:text-accent-text"}`}>
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
