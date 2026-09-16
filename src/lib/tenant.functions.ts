import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Returns the current user's active tenant, bootstrapping one on first login.
export const getOrCreateMyTenant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId, claims } = context;

    const { data: existing, error: membershipError } = await supabase
      .from("tenant_members")
      .select("tenant_id, role, tenants(id, name, slug)")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();

    if (membershipError) throw new Error("Unable to verify workspace membership");
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

    const { data: created, error: tErr } = await supabase
      .rpc("create_my_tenant" as never, { _name: name, _slug: slug } as never);
    const tenant = created as { id: string; name: string; slug: string } | null;
    if (tErr || !tenant) throw new Error(tErr?.message ?? "Could not create workspace");

    const { data: membership, error: roleError } = await supabase
      .from("tenant_members").select("role").eq("tenant_id", tenant.id).eq("user_id", userId).single();
    if (roleError || !membership) throw new Error("Unable to verify the new workspace membership");
    return { tenantId: tenant.id, role: membership.role, tenant };
  });
