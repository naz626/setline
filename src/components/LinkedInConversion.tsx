"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

declare global {
  interface Window {
    lintrk?: (event: "track", payload: { conversion_id: number }) => void;
  }
}

/** LinkedIn Insight Tag conversion ids. Created in Campaign Manager → Measure → Conversion tracking. */
export const LINKEDIN_CONVERSIONS = {
  signUp: 30726604,
} as const;

/**
 * Fires a LinkedIn Insight Tag conversion exactly once, then strips the triggering
 * query param from the URL so a refresh or back-navigation doesn't fire it again.
 */
export function LinkedInConversion({ fire, conversionId, param }: { fire: boolean; conversionId: number; param: string }) {
  const router = useRouter();

  useEffect(() => {
    if (!fire) return;
    window.lintrk?.("track", { conversion_id: conversionId });
    const url = new URL(window.location.href);
    url.searchParams.delete(param);
    router.replace(url.pathname + url.search, { scroll: false });
    // Fire once on mount for this param only; re-running on prop identity changes would refire it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
