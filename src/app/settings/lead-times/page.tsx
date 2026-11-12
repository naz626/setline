import { LeadTimePlanner } from "@/components/LeadTimePlanner";
import { TopNav } from "@/components/TopNav";
import { leadTimeProfiles, processes, vendors } from "@/lib/data/seed";

export default function LeadTimesPage() {
  return (
    <>
      <TopNav active="/settings/lead-times" />
      <main className="mx-auto flex max-w-[1200px] flex-col gap-6 px-6 pt-8 pb-12">
        <div>
          <h1 className="font-display text-4xl font-bold tracking-tight">Lead times</h1>
          <p className="mt-1.5 max-w-[720px] text-[15px] leading-relaxed text-muted">
            Lead times change with the vendor, where the display is made, and how it is made. Setline starts from your workspace default,
            then applies the narrower profiles that fit a program. You can still change any step on a single program.
          </p>
        </div>
        <LeadTimePlanner profiles={leadTimeProfiles} vendors={vendors} processes={processes} />
      </main>
    </>
  );
}
