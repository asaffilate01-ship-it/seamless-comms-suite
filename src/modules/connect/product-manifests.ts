export type ConnectProductManifest = {
  product: string;
  name: string;
  events: string[];
  tools: string[];
};

export const CONNECT_PRODUCT_MANIFESTS: ConnectProductManifest[] = [
  {
    product: "courier-broker",
    name: "Courier Broker OS",
    events: [
      "courier.driver.offer",
      "courier.driver.reminder",
      "courier.delivery.collected",
      "courier.delivery.out_for_delivery",
      "courier.delivery.completed",
      "courier.delivery.exception",
      "courier.compliance.expiring",
    ],
    tools: [
      "quote_delivery",
      "create_booking",
      "track_delivery",
      "reschedule_delivery",
      "cancel_delivery",
      "get_driver_eta",
      "report_delivery_problem",
    ],
  },
  {
    product: "sparesgrid",
    name: "SparesGrid",
    events: ["parts.quote.ready", "parts.order.status", "parts.supplier.reply"],
    tools: ["vehicle_lookup", "identify_part", "check_fitment", "search_suppliers", "request_quote", "create_order", "track_order"],
  },
  {
    product: "autohashi",
    name: "AutoHashi",
    events: ["vehicle.match.found", "inspection.updated", "shipping.updated", "document.required"],
    tools: ["vehicle_search", "auction_search", "inspection_request", "landed_cost", "shipping_status", "document_request"],
  },
  {
    product: "zivvo",
    name: "Zivvo",
    events: ["vehicle.lead.created", "valuation.ready", "appointment.reminder", "inspection.updated"],
    tools: ["vehicle_lookup", "stock_search", "valuation_create", "lead_qualify", "appointment_book", "inspection_request", "crm_update"],
  },
  {
    product: "dishbee",
    name: "Dishbee",
    events: ["order.confirmed", "order.ready", "order.out_for_delivery", "booking.reminder"],
    tools: ["get_menu", "create_order", "track_order", "book_table", "report_order_problem"],
  },
  {
    product: "dishbee-plus",
    name: "Dishbee+",
    events: [
      "marketplace.vendor.created",
      "marketplace.vendor.status",
      "marketplace.catalogue.updated",
      "marketplace.order.created",
      "marketplace.order.paid",
      "marketplace.order.accepted",
      "marketplace.order.ready",
      "marketplace.order.out_for_delivery",
      "marketplace.order.completed",
      "marketplace.order.cancelled",
      "marketplace.refund.updated",
      "marketplace.delivery.exception",
    ],
    tools: [
      "search_marketplace",
      "get_vendor",
      "get_catalogue",
      "create_marketplace_order",
      "track_marketplace_order",
      "quote_delivery",
      "create_delivery",
      "cancel_delivery",
      "get_customer_rewards",
      "report_marketplace_problem",
    ],
  },
  {
    product: "haccora",
    name: "Haccora",
    events: ["compliance.alert", "temperature.alert", "checklist.overdue", "incident.created"],
    tools: ["get_alerts", "get_compliance_status", "get_temperature", "complete_check", "create_incident"],
  },
];

export const connectManifest = (product: string) =>
  CONNECT_PRODUCT_MANIFESTS.find((m) => m.product === product);
