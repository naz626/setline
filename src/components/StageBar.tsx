import { STAGES } from "@/lib/status";
import type { Stage } from "@/lib/timeline";

/** Six segments, filled up to and including the current stage. Decorative: the stage name is always shown next to it. */
export function StageBar({ stage, color, complete }: { stage: Stage; color: string; complete?: boolean }) {
  const current = STAGES.findIndex((s) => s.key === stage);
  return (
    <div className="flex gap-[3px]" aria-hidden="true">
      {STAGES.map((s, i) => (
        <span key={s.key} className="h-1.5 w-4 rounded-full" style={{ background: complete || i <= current ? color : "var(--color-line)" }} />
      ))}
    </div>
  );
}
