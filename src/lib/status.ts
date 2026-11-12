import type { Health, Stage, VendorState } from "@/lib/timeline";

export interface StatusStyle {
  label: string;
  text: string;
  tint: string;
  dot: string;
  /** SVG path data on a 12 by 12 grid. Every status has its own shape so color is never the only signal. */
  icon: string;
  iconFilled?: boolean;
  iconDashed?: boolean;
}

export const HEALTH_STYLES: Record<Health, StatusStyle> = {
  onTrack: { label: "On track", text: "#14633F", tint: "#DDF1E5", dot: "#1A8F58", icon: "M2.5 6.5l2.5 2.5 4.5-5" },
  atRisk: { label: "At risk", text: "#7A4B00", tint: "#FCEBC7", dot: "#B07A00", icon: "M6 2L10.8 10H1.2z" },
  willMiss: { label: "Will miss date", text: "#9B1C1C", tint: "#FADDDB", dot: "#D6322E", icon: "M3 3l6 6M9 3l-6 6" },
  complete: { label: "Complete", text: "#1B4FA8", tint: "#DCE7FA", dot: "#2459C7", icon: "M1 6.5l2.5 2.5L8 4M6.5 9L11 4" },
  notStarted: { label: "Not started", text: "#55504A", tint: "#EAE6DF", dot: "#857E73", icon: "M6 2a4 4 0 100 8 4 4 0 000-8z", iconDashed: true },
};

export const VENDOR_STYLES: Record<VendorState, StatusStyle> = {
  working: { label: "Working", text: "#0B5E5C", tint: "#D5F0EE", dot: "#0E8E8A", icon: "M3.5 2.2l6 3.8-6 3.8z", iconFilled: true },
  waitingOnYou: { label: "Waiting on you", text: "#5B2FC2", tint: "#E8E0FA", dot: "#9B6AF0", icon: "M4 2.5v7M8 2.5v7" },
  backlogged: { label: "Backlogged", text: "#8F1D57", tint: "#F8DCEA", dot: "#B3266F", icon: "M2 3.5h8M2 6h8M2 8.5h8" },
};

export const STAGES: { key: Stage; label: string }[] = [
  { key: "plan", label: "Plan" },
  { key: "submit", label: "Submit" },
  { key: "approve", label: "Approve" },
  { key: "produce", label: "Produce" },
  { key: "ship", label: "Ship" },
  { key: "inStore", label: "In store" },
];

export type ApprovalStatusKey = "needsDecision" | "changesRequested" | "awaitingProof" | "approved";

export const APPROVAL_STYLES: Record<ApprovalStatusKey, StatusStyle> = {
  needsDecision: { ...VENDOR_STYLES.waitingOnYou, label: "Needs a decision" },
  changesRequested: { ...HEALTH_STYLES.atRisk, label: "Changes requested", icon: "M2 9.5l1-3 5-5 2 2-5 5z" },
  awaitingProof: { ...HEALTH_STYLES.notStarted, label: "Waiting for proof" },
  approved: { ...HEALTH_STYLES.onTrack, label: "Approved" },
};

/** One version of a quote or proof, as opposed to the approval as a whole. */
export const VERSION_STYLES = {
  needsDecision: APPROVAL_STYLES.needsDecision,
  changesRequested: APPROVAL_STYLES.changesRequested,
  approved: APPROVAL_STYLES.approved,
  replaced: { ...HEALTH_STYLES.notStarted, label: "Replaced" },
  withdrawn: { ...HEALTH_STYLES.notStarted, label: "Approval withdrawn" },
} satisfies Record<string, StatusStyle>;

export type StoreStatusKey = "notShipped" | "shipped" | "delivered" | "installed";

export const STORE_STYLES: Record<StoreStatusKey, StatusStyle> = {
  notShipped: { ...HEALTH_STYLES.notStarted, label: "Not shipped" },
  shipped: { ...VENDOR_STYLES.working, label: "Shipped", icon: "M1.5 6h8M6.5 3l3 3-3 3" },
  delivered: { ...HEALTH_STYLES.complete, label: "Delivered", icon: "M2 4.5l4-2 4 2v4l-4 2-4-2z" },
  installed: { ...HEALTH_STYLES.onTrack, label: "Installed" },
};
