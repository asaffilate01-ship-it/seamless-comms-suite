import { useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  LoaderCircle,
  PackageSearch,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getSyndrivaGrowthSources, importSyndrivaGrowthSource } from "./syndriva-sources.functions";

function price(minor: string | null, currency: string) {
  if (minor === null) return "No price recorded";
  try {
    const amount = BigInt(minor);
    if (amount > BigInt(Number.MAX_SAFE_INTEGER)) return `${minor} minor units · ${currency}`;
    const formatter = new Intl.NumberFormat("en-GB", { style: "currency", currency });
    const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
    return formatter.format(Number(amount) / 10 ** digits);
  } catch {
    return `${minor} minor units · ${currency}`;
  }
}

export function SyndrivaSourcesPanel({
  tenantId,
  brandId,
  canWrite,
  onChanged,
}: {
  tenantId: string;
  brandId: string;
  canWrite: boolean;
  onChanged: () => Promise<unknown>;
}) {
  const load = useServerFn(getSyndrivaGrowthSources);
  const importSource = useServerFn(importSyndrivaGrowthSource);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const query = useInfiniteQuery({
    queryKey: ["growth-syndriva-sources", tenantId, brandId],
    queryFn: ({ pageParam }) => load({ data: { tenantId, brandId, offset: pageParam } }),
    initialPageParam: 0,
    getNextPageParam: (page) => page.nextOffset ?? undefined,
    retry: false,
  });
  const state = query.data?.pages[0];
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];

  async function save(listingId: string) {
    if (busy.current || !canWrite) return;
    busy.current = true;
    setPending(listingId);
    setError(null);
    try {
      const result = await importSource({ data: { tenantId, brandId, listingId } });
      await Promise.all([query.refetch(), onChanged()]);
      toast.success(
        result.replayed
          ? "This product source is already current."
          : "Product source saved from Syndriva.",
      );
    } catch (cause) {
      await Promise.allSettled([query.refetch(), onChanged()]);
      setError(
        cause instanceof Error
          ? cause.message
          : "The product source could not be imported. Refresh and try again.",
      );
    } finally {
      setPending(null);
      busy.current = false;
    }
  }

  return (
    <section
      className="space-y-4 rounded-xl border bg-muted/30 p-4"
      aria-label="Syndriva product sources"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <PackageSearch className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Import from Syndriva</h3>
        </div>
        <Button
          size="sm"
          variant="ghost"
          disabled={query.isFetching || !!pending}
          onClick={() => query.refetch()}
        >
          <RefreshCw className={cn("h-4 w-4", query.isFetching && "animate-spin")} />
          Refresh products
        </Button>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Import eligible listings from this workspace into the selected brand. Sources expire after
        15 minutes, and changes to the listing, vendor or tracked stock block use until the source
        is refreshed.
      </p>
      {query.isPending ? (
        <p role="status" className="flex items-center gap-2 text-sm">
          <LoaderCircle className="h-4 w-4 animate-spin" />
          Checking the product catalogue…
        </p>
      ) : query.isError ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Product sources could not be checked</AlertTitle>
          <AlertDescription>
            {query.error instanceof Error ? query.error.message : "Refresh to try again."}
          </AlertDescription>
        </Alert>
      ) : !state?.available ? (
        <Alert>
          <PackageSearch className="h-4 w-4" />
          <AlertTitle>Syndriva catalogue is not available</AlertTitle>
          <AlertDescription>
            {state?.message ||
              "The marketplace source must be configured before products can be imported."}
          </AlertDescription>
        </Alert>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-background p-5 text-center">
          <p className="text-sm font-medium">No eligible listings yet</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            A listing and its vendor must be active. Tracked inventory must have available stock in
            the matching workspace and location.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <article key={item.listingId} className="rounded-lg border bg-background p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h4 className="break-words text-sm font-semibold">{item.title}</h4>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.vendorName} · {price(item.priceMinor, item.currency)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.inventoryTracked
                      ? `${item.availableQuantity ?? "0"} available in tracked stock`
                      : "Inventory is not tracked"}
                  </p>
                </div>
                <Badge variant="outline">
                  {item.current
                    ? "Source current"
                    : item.evidenceId
                      ? "Refresh needed"
                      : "Not imported"}
                </Badge>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-2">
                <p className="text-xs text-muted-foreground">
                  {item.validUntil
                    ? `Source valid until ${new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).format(new Date(item.validUntil))} UTC`
                    : "Import checks the saved product data again."}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!canWrite || !!pending || item.current}
                  onClick={() => {
                    void save(item.listingId);
                  }}
                >
                  {pending === item.listingId ? (
                    <LoaderCircle className="animate-spin" />
                  ) : item.current ? (
                    <CheckCircle2 />
                  ) : (
                    <Download />
                  )}
                  {item.current ? "Imported" : item.evidenceId ? "Refresh source" : "Import source"}
                </Button>
              </div>
            </article>
          ))}
          {query.hasNextPage && (
            <Button
              size="sm"
              variant="outline"
              disabled={query.isFetchingNextPage || !!pending}
              onClick={() => query.fetchNextPage()}
            >
              {query.isFetchingNextPage && <LoaderCircle className="animate-spin" />}Load more
              products
            </Button>
          )}
        </div>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Import needs attention</AlertTitle>
          <AlertDescription className="break-words">{error}</AlertDescription>
        </Alert>
      )}
    </section>
  );
}
