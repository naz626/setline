import type { StatusStyle } from "@/lib/status";

export function StatusIcon({ style, size = 12 }: { style: StatusStyle; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden="true"
      fill={style.iconFilled ? "currentColor" : "none"}
      stroke={style.iconFilled ? "none" : "currentColor"}
      strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
      strokeDasharray={style.iconDashed ? "2 2" : undefined}>
      <path d={style.icon} />
    </svg>
  );
}

export function StatusPill({ style }: { style: StatusStyle }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-semibold whitespace-nowrap"
      style={{ background: style.tint, color: style.text }}>
      <StatusIcon style={style} />
      {style.label}
    </span>
  );
}
