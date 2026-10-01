import type { ReactNode } from "react";

/**
 * The promo password gate was removed: every public page (homepage, platform,
 * pricing, legal) is open to everyone. The app itself stays behind real
 * sign-in via the _authenticated route group. SiteGate is kept as a
 * passthrough so existing imports in __root.tsx keep working.
 */
export function SiteGate({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
