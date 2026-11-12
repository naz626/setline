/** Fixed choice lists for now. These become editable per workspace later. */
export const PROCESSES = [
  { id: "corrugate", label: "Corrugate" },
  { id: "print", label: "Print" },
  { id: "permanent", label: "Permanent fixture" },
] as const;

export const DISPLAY_TYPES = ["Endcap", "Floor stand", "Floor tower", "Counter unit", "Shelf tray", "Window", "Other"] as const;

export function processLabel(id: string): string {
  return PROCESSES.find((p) => p.id === id)?.label ?? id;
}
