import { fileHref } from "@/lib/uploads";
import type { GuidelineView } from "@/lib/services/guidelines";

const TYPE_NAMES = { store: "Store", brand: "Brand", vendor: "Vendor" };

/** The guidelines that apply to a program, each linking to its newest version. */
export function GuidelineLinks({ items }: { items: GuidelineView[] }) {
  if (items.length === 0) return <p className="text-sm text-muted">No guidelines apply yet.</p>;
  return (
    <ul>
      {items.map(({ guideline, versions }) => (
        <li key={guideline.id} className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-line py-2.5 last:border-b-0">
          <a href={versions[0] ? fileHref("guideline", versions[0].id, versions[0].url) : undefined} target="_blank" rel="noopener noreferrer" className="inline-block py-1.5 text-sm font-semibold underline hover:text-accent-text">
            {guideline.title}<span className="sr-only"> (opens in a new tab)</span>
          </a>
          <span className="text-[13px] text-muted">{TYPE_NAMES[guideline.type]} · {versions[0]?.label}</span>
        </li>
      ))}
    </ul>
  );
}
