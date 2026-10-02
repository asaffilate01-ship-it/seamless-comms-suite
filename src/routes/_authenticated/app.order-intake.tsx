import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { AppShell, StatusBadge } from "@/components/app/shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useTenant } from "@/hooks/useTenant";
import { getTenantControlPlane } from "@/lib/control-plane.functions";
import {
  createManualOrderIntake,
  listOrderChannels,
  listOrderIntake,
  saveOrderChannel,
} from "@/modules/connect/order-intake.functions";
import { PhoneCall, Plus, RefreshCw, ShoppingBasket } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/order-intake")({
  component: OrderIntake,
  head: () => ({
    meta: [
      { title: "Assisted Ordering — Omniqora" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

type BasketItem = {
  name: string;
  sku?: string;
  qty: number;
  unitMinor: number;
};

function OrderIntake() {
  const tenant = useTenant();
  const tenantId = tenant.tenantId ?? "";
  const detailFn = useServerFn(getTenantControlPlane);
  const listFn = useServerFn(listOrderIntake);
  const channelsFn = useServerFn(listOrderChannels);
  const createFn = useServerFn(createManualOrderIntake);
  const saveChannelFn = useServerFn(saveOrderChannel);

  const detail = useQuery({
    queryKey: ["order-intake-tenant", tenantId],
    queryFn: () => detailFn({ data: { tenantId } }),
    enabled: Boolean(tenantId),
    retry: false,
  });

  const products = (detail.data?.products ?? []).filter(
    (product) => !["cancelled", "failed"].includes(product.status),
  );
  const locations = (detail.data?.locations ?? []).filter(
    (location) => location.status === "active" || location.status === "opening",
  );

  const [productKey, setProductKey] = useState("dishbee");
  const [locationId, setLocationId] = useState("");
  const [fulfilment, setFulfilment] = useState<
    "pickup" | "curbside" | "delivery" | "dine_in"
  >("pickup");

  const orders = useQuery({
    queryKey: ["order-intake", tenantId, productKey],
    queryFn: () => listFn({ data: { tenantId, productKey } }),
    enabled: Boolean(tenantId && productKey),
    retry: false,
  });

  const channels = useQuery({
    queryKey: ["order-channels", tenantId],
    queryFn: () => channelsFn({ data: { tenantId } }),
    enabled: Boolean(tenantId),
    retry: false,
  });

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [itemName, setItemName] = useState("");
  const [sku, setSku] = useState("");
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("");
  const [items, setItems] = useState<BasketItem[]>([]);

  const [channel, setChannel] = useState<"voice" | "whatsapp" | "manual">("manual");
  const [address, setAddress] = useState("");
  const [forward, setForward] = useState("");
  const [ai, setAi] = useState(false);
  const [human, setHuman] = useState(true);

  const total = useMemo(
    () => items.reduce((sum, item) => sum + item.qty * item.unitMinor, 0),
    [items],
  );

  const locationName = (id: string | null | undefined) =>
    locations.find((location) => location.id === id)?.name ?? id ?? "No location";

  async function refresh() {
    await Promise.all([orders.refetch(), channels.refetch(), detail.refetch()]);
  }

  async function create() {
    try {
      await createFn({
        data: {
          tenantId,
          productKey,
          brandId: null,
          locationId: locationId || null,
          channel,
          fulfilment,
          customerPhone: customerPhone || null,
          customerName: customerName || null,
          items,
          currency: "GBP",
          idempotencyKey: "staff-" + crypto.randomUUID(),
        },
      });
      toast.success("Order intake session created");
      setItems([]);
      setCustomerName("");
      setCustomerPhone("");
      await orders.refetch();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to create intake",
      );
    }
  }

  async function addChannel() {
    try {
      await saveChannelFn({
        data: {
          tenantId,
          productKey,
          brandId: null,
          locationId: locationId || null,
          channel,
          provider: "twilio",
          address,
          aiReceptionEnabled: ai,
          humanHandoffEnabled: human,
          greeting: null,
          forwardTo: forward || null,
        },
      });
      toast.success("Ordering channel saved");
      setAddress("");
      await channels.refetch();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to save channel",
      );
    }
  }

  function addItem() {
    if (!itemName || !price) return;
    setItems((current) => [
      ...current,
      {
        name: itemName,
        sku: sku.trim() || undefined,
        qty: Number(qty || 1),
        unitMinor: Math.round(Number(price) * 100),
      },
    ]);
    setItemName("");
    setSku("");
    setQty("1");
    setPrice("");
  }

  const dishbeeNeedsLocation = productKey === "dishbee";
  const dishbeeItemsMapped =
    productKey !== "dishbee" || items.every((item) => Boolean(item.sku));

  return (
    <AppShell
      title="Assisted Ordering"
      subtitle="Phone, WhatsApp and staff-entered orders with payment state and controlled Dishbee handoff."
      actions={
        <Button variant="outline" size="sm" onClick={refresh}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      }
    >
      <div className="grid gap-4 md:grid-cols-4">
        <Metric
          label="Draft / payment"
          value={String(
            (orders.data ?? []).filter((order: any) =>
              ["draft", "awaiting_payment"].includes(order.status),
            ).length,
          )}
        />
        <Metric
          label="Ready for Dishbee"
          value={String(
            (orders.data ?? []).filter(
              (order: any) => order.status === "handoff_ready",
            ).length,
          )}
        />
        <Metric
          label="Submitted"
          value={String(
            (orders.data ?? []).filter(
              (order: any) => order.status === "submitted",
            ).length,
          )}
        />
        <Metric
          label="Configured channels"
          value={String((channels.data ?? []).length)}
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[440px_1fr]">
        <div className="space-y-6">
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center gap-2">
                <ShoppingBasket className="h-4 w-4" />
                <h2 className="font-semibold">New assisted order</h2>
              </div>

              <select
                className="mt-4 h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={productKey}
                onChange={(event) => setProductKey(event.target.value)}
              >
                {products.map((product) => (
                  <option key={product.product_key} value={product.product_key}>
                    {product.product_key}
                  </option>
                ))}
              </select>

              <select
                className="mt-3 h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={locationId}
                onChange={(event) => setLocationId(event.target.value)}
              >
                <option value="">Choose location</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>

              <select
                className="mt-3 h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={fulfilment}
                onChange={(event) =>
                  setFulfilment(
                    event.target.value as
                      | "pickup"
                      | "curbside"
                      | "delivery"
                      | "dine_in",
                  )
                }
              >
                <option value="pickup">Pickup</option>
                <option value="curbside">Curbside</option>
                <option value="delivery">Delivery</option>
                <option value="dine_in">Dine in</option>
              </select>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <Input
                  placeholder="Customer name"
                  value={customerName}
                  onChange={(event) => setCustomerName(event.target.value)}
                />
                <Input
                  placeholder="+447..."
                  value={customerPhone}
                  onChange={(event) => setCustomerPhone(event.target.value)}
                />
              </div>

              <div className="mt-3 grid grid-cols-[1fr_120px_70px_100px] gap-2">
                <Input
                  placeholder="Item"
                  value={itemName}
                  onChange={(event) => setItemName(event.target.value)}
                />
                <Input
                  placeholder="Dishbee SKU"
                  value={sku}
                  onChange={(event) => setSku(event.target.value)}
                />
                <Input
                  type="number"
                  min="1"
                  value={qty}
                  onChange={(event) => setQty(event.target.value)}
                />
                <Input
                  type="number"
                  min="0"
                  step=".01"
                  placeholder="£"
                  value={price}
                  onChange={(event) => setPrice(event.target.value)}
                />
              </div>

              <Button
                className="mt-2"
                variant="outline"
                disabled={!itemName || !price}
                onClick={addItem}
              >
                <Plus className="mr-2 h-4 w-4" />
                Add item
              </Button>

              <div className="mt-3 space-y-2">
                {items.map((item, index) => (
                  <div
                    key={index}
                    className="flex justify-between rounded bg-muted p-2 text-sm"
                  >
                    <span>
                      {item.qty} × {item.name}
                      {item.sku ? (
                        <span className="ml-2 text-xs text-muted-foreground">
                          SKU {item.sku}
                        </span>
                      ) : null}
                    </span>
                    <span>{money(item.qty * item.unitMinor)}</span>
                  </div>
                ))}
              </div>

              {productKey === "dishbee" && !dishbeeItemsMapped ? (
                <p className="mt-3 text-xs text-destructive">
                  Every Dishbee basket line needs a SKU or explicit item mapping
                  before it can be handed to Dishbee.
                </p>
              ) : null}

              <div className="mt-3 flex justify-between font-semibold">
                <span>Total</span>
                <span>{money(total)}</span>
              </div>

              <Button
                className="mt-3 w-full"
                disabled={
                  !items.length ||
                  !tenantId ||
                  (dishbeeNeedsLocation && !locationId) ||
                  !dishbeeItemsMapped
                }
                onClick={create}
              >
                Create intake session
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <div className="flex items-center gap-2">
                <PhoneCall className="h-4 w-4" />
                <h2 className="font-semibold">Twilio ordering line</h2>
              </div>
              <select
                className="mt-4 h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={channel}
                onChange={(event) =>
                  setChannel(
                    event.target.value as "voice" | "whatsapp" | "manual",
                  )
                }
              >
                <option value="voice">voice</option>
                <option value="whatsapp">whatsapp</option>
                <option value="manual">manual</option>
              </select>
              <p className="mt-2 text-xs text-muted-foreground">
                The line will be bound to {locationName(locationId)}.
              </p>
              <Input
                className="mt-3"
                placeholder="Twilio To address / number"
                value={address}
                onChange={(event) => setAddress(event.target.value)}
              />
              <Input
                className="mt-3"
                placeholder="Forward-to number (optional)"
                value={forward}
                onChange={(event) => setForward(event.target.value)}
              />
              <label className="mt-3 flex gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={ai}
                  onChange={(event) => setAi(event.target.checked)}
                />
                AI reception enabled
              </label>
              <label className="mt-2 flex gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={human}
                  onChange={(event) => setHuman(event.target.checked)}
                />
                Human handoff allowed
              </label>
              <Button
                className="mt-3"
                disabled={
                  !address ||
                  !tenantId ||
                  (dishbeeNeedsLocation && !locationId)
                }
                onClick={addChannel}
              >
                Save line
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardContent className="p-0">
              <div className="border-b p-5">
                <h2 className="font-semibold">Order intake queue</h2>
                <p className="text-xs text-muted-foreground">
                  Paid orders become handoff-ready; Dishbee claims and
                  acknowledges them using its scoped runtime credential.
                </p>
              </div>
              <div className="divide-y">
                {(orders.data ?? []).map((order: any) => (
                  <div key={order.id} className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <b>
                          {order.customer_name ||
                            order.customer_phone ||
                            "Customer"}
                        </b>
                        <p className="text-xs text-muted-foreground">
                          {order.channel} · {order.product_key} ·{" "}
                          {locationName(order.location_id)} ·{" "}
                          {order.order_draft?.fulfilment ?? "unspecified"} ·{" "}
                          {new Date(order.created_at).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Badge variant="outline">
                          {money(order.total_minor ?? 0)}
                        </Badge>
                        <StatusBadge status={order.status} />
                      </div>
                    </div>
                    {order.target_order_id ? (
                      <p className="mt-2 text-xs">
                        Dishbee order: <code>{order.target_order_id}</code>
                      </p>
                    ) : null}
                  </div>
                ))}
                {!(orders.data ?? []).length ? (
                  <p className="p-5 text-sm text-muted-foreground">
                    No intake sessions yet.
                  </p>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              <div className="border-b p-5">
                <h2 className="font-semibold">Configured lines</h2>
              </div>
              <div className="divide-y">
                {(channels.data ?? []).map((line: any) => (
                  <div
                    key={line.id}
                    className="flex items-center justify-between p-4 text-sm"
                  >
                    <div>
                      <b>{line.address}</b>
                      <p className="text-xs text-muted-foreground">
                        {line.provider} · {line.channel} · {line.product_key} ·{" "}
                        {locationName(line.location_id)}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {line.ai_reception_enabled ? (
                        <Badge variant="outline">AI</Badge>
                      ) : null}
                      {line.human_handoff_enabled ? (
                        <Badge variant="outline">Human</Badge>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="mt-2 font-display text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}

function money(minor: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(minor / 100);
}
