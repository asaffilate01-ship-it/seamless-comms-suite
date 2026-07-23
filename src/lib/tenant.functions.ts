import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Returns the current user's active tenant, bootstrapping one on first login.
export const getOrCreateMyTenant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId, claims } = context;

    const { data: existing } = await supabase
      .from("tenant_members")
      .select("tenant_id, role, tenants(id, name, slug)")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();

    if (existing?.tenant_id) {
      return {
        tenantId: existing.tenant_id as string,
        role: existing.role as string,
        tenant: existing.tenants as { id: string; name: string; slug: string },
      };
    }

    const email = (claims.email as string | undefined) ?? "user";
    const baseSlug = email.split("@")[0].toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 24) || "tenant";
    const slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
    const name = `${baseSlug}'s workspace`;

    const { data: tenant, error: tErr } = await supabase
      .from("tenants")
      .insert({ name, slug })
      .select("id, name, slug")
      .single();
    if (tErr || !tenant) throw new Error(tErr?.message ?? "Could not create workspace");

    const { error: mErr } = await supabase
      .from("tenant_members")
      .insert({ tenant_id: tenant.id, user_id: userId, role: "owner" });
    if (mErr) throw new Error(mErr.message);

    return { tenantId: tenant.id, role: "owner", tenant };
  });
