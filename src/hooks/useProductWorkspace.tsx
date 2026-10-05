import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTenant } from "@/hooks/useTenant";
import { listMyTenantProducts } from "@/modules/platform/workspace.functions";

export type ProductWorkspace = {
  id: string;
  tenant_id: string;
  product_key: string;
  region_key: string;
  plan_key?: string | null;
  brand_key?: string | null;
  status: string;
  settings?: Record<string, unknown> | null;
  provisioned_at?: string | null;
  moduleKeys: string[];
  modules: Array<Record<string, unknown>>;
  domains: Array<Record<string, unknown>>;
  brands: Array<Record<string, unknown>>;
  locations: Array<Record<string, unknown>>;
};

export function useProductWorkspace() {
  const tenant = useTenant();
  const request = useServerFn(listMyTenantProducts);
  const [selectedId, setSelectedId] = useState("");

  const query = useQuery({
    queryKey: ["tenant-product-workspaces", tenant.tenantId],
    enabled: !!tenant.tenantId,
    queryFn: () => request({ data: { tenantId: tenant.tenantId! } }),
    retry: false,
  });

  const products = (query.data?.products ?? []) as ProductWorkspace[];

  useEffect(() => {
    if (!products.length) {
      if (selectedId) setSelectedId("");
      return;
    }
    if (!selectedId || !products.some((item) => item.id === selectedId)) {
      setSelectedId(products[0].id);
    }
  }, [products, selectedId]);

  const selected = useMemo(
    () => products.find((item) => item.id === selectedId) ?? products[0] ?? null,
    [products, selectedId],
  );

  return {
    tenant,
    role: query.data?.role ?? tenant.role,
    products,
    selected,
    selectedId: selected?.id ?? selectedId,
    setSelectedId,
    loading: tenant.loading || query.isPending,
    error: tenant.error ?? (query.error instanceof Error ? query.error.message : query.error ? String(query.error) : null),
    refetch: query.refetch,
  };
}

export function ProductWorkspacePicker({
  products,
  selectedId,
  onChange,
}: {
  products: ProductWorkspace[];
  selectedId: string;
  onChange: (id: string) => void;
}) {
  if (products.length <= 1) return null;
  return (
    <select
      value={selectedId}
      onChange={(event) => onChange(event.target.value)}
      className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm"
      aria-label="Product workspace"
    >
      {products.map((product) => (
        <option key={product.id} value={product.id}>
          {product.product_key} · {product.region_key}
        </option>
      ))}
    </select>
  );
}
