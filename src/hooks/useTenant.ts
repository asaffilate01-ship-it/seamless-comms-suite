import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getOrCreateMyTenant } from "@/lib/tenant.functions";

export type TenantState = {
  tenantId: string | null;
  role: string | null;
  name: string | null;
  loading: boolean;
  error: string | null;
};

/** Resolves (and bootstraps on first login) the current user's workspace. */
export function useTenant(): TenantState {
  const bootstrap = useServerFn(getOrCreateMyTenant);
  const [state, setState] = useState<TenantState>({
    tenantId: null,
    role: null,
    name: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    bootstrap()
      .then((t) => {
        if (cancelled) return;
        setState({
          tenantId: t.tenantId,
          role: t.role,
          name: t.tenant?.name ?? null,
          loading: false,
          error: null,
        });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setState((s) => ({
          ...s,
          loading: false,
          error: e instanceof Error ? e.message : "Workspace konnte nicht geladen werden",
        }));
      });
    return () => {
      cancelled = true;
    };
  }, [bootstrap]);

  return state;
}

export function canWrite(role: string | null): boolean {
  return role === "owner" || role === "admin" || role === "agent";
}
