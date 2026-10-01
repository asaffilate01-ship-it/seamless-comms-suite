import { OMNIQORA_PRODUCTS } from "@/modules/platform/registry";

export type ConnectProductManifest = {
  product: string;
  name: string;
  events: string[];
  eventPrefixes: string[];
  tools: string[];
  modules: string[];
  status: "native" | "adapter_ready" | "adapter_required";
};

type ModuleConnectContract={
  eventPrefixes:string[];
  tools:string[];
};

const MODULE_CONNECT_CONTRACTS:Record<string,ModuleConnectContract>={
  "crm.core":{
    eventPrefixes:["crm.","customer.","lead.","opportunity."],
    tools:["customer_lookup","customer_update","lead_create","lead_update","crm_timeline"]
  },
  "connect.core":{
    eventPrefixes:["connect.","communication.","message.","call."],
    tools:["send_message","send_template","start_masked_call","handoff_conversation"]
  },
  "reception.core":{
    eventPrefixes:["reception."],
    tools:["caller_lookup","reception_intake","handoff_request"]
  },
  "marketplace.core":{
    eventPrefixes:["marketplace.","vendor.","listing.","review.","dispute."],
    tools:["vendor_lookup","listing_search","create_order","order_status","open_dispute"]
  },
  "ordering.core":{
    eventPrefixes:["order.","cart.","menu."],
    tools:["get_catalogue","create_order","update_order","track_order","report_order_problem"]
  },
  "bookings.core":{
    eventPrefixes:["booking.","appointment.","availability."],
    tools:["check_availability","create_booking","reschedule_booking","cancel_booking"]
  },
  "payments.core":{
    eventPrefixes:["payment.","refund.","payout.","invoice."],
    tools:["create_payment_link","payment_status","refund_status"]
  },
  "geo.core":{
    eventPrefixes:["geo.","route.","eta.","geofence."],
    tools:["geocode","route","eta","optimise_route"]
  },
  "dispatch.core":{
    eventPrefixes:["dispatch.","delivery.","driver.","agent.","fleet."],
    tools:["create_job","assign_job","track_job","get_driver_eta","report_job_problem"]
  },
  "inventory.core":{
    eventPrefixes:["inventory.","stock.","supplier."],
    tools:["inventory_lookup","stock_check","supplier_lookup"]
  },
  "compliance.core":{
    eventPrefixes:["compliance.","inspection.","incident.","requirement."],
    tools:["compliance_status","get_requirements","create_incident","evidence_status"]
  },
  "documents.core":{
    eventPrefixes:["document.","signature.","evidence."],
    tools:["document_request","document_status","signature_request"]
  },
  "practice.core":{
    eventPrefixes:["practice.","engagement.","deadline.","filing."],
    tools:["client_lookup","engagement_status","deadline_lookup"]
  },
  "accounting_ai.core":{
    eventPrefixes:["accounting.","bookkeeping.","accounts."],
    tools:["document_ingestion_status","classification_review","trial_balance_status"]
  },
  "tax_intelligence.core":{
    eventPrefixes:["tax."],
    tools:["tax_source_search","tax_issue_review"]
  },
  "childcare.core":{
    eventPrefixes:["childcare.","placement.","attendance.","funding.","safeguarding."],
    tools:["provider_search","placement_status","attendance_status","funding_status"]
  },
  "support.core":{
    eventPrefixes:["support.","case.","ticket."],
    tools:["create_support_ticket","support_status"]
  },
  "loyalty.core":{
    eventPrefixes:["loyalty.","reward.","voucher."],
    tools:["loyalty_balance","reward_catalogue","redeem_reward"]
  },
  "automation.core":{
    eventPrefixes:["automation.","workflow."],
    tools:["workflow_status"]
  },
  "forms.core":{
    eventPrefixes:["form.","submission."],
    tools:["form_status","submission_status"]
  },
  "marketing.core":{
    eventPrefixes:["marketing.","campaign.","audience."],
    tools:["campaign_status","audience_lookup"]
  },
  "sales.core":{
    eventPrefixes:["sales.","sequence.","callback."],
    tools:["sales_task_create","sequence_status","meeting_book"]
  },
  "feedback.core":{
    eventPrefixes:["feedback.","nps.","csat.","ces."],
    tools:["feedback_request","feedback_status"]
  },
  "notifications.core":{
    eventPrefixes:["notification."],
    tools:["notification_status"]
  },
  "hospitality.intelligence":{
    eventPrefixes:["hospitality.","kds.","recipe.","waste."],
    tools:["hospitality_insight","menu_performance"]
  },
};

const EXPLICIT:Record<string,Partial<ConnectProductManifest>>={
  "courier-connect-hub":{
    events:[
      "courier.driver.offer","courier.driver.reminder","courier.delivery.collected",
      "courier.delivery.out_for_delivery","courier.delivery.completed",
      "courier.delivery.exception","courier.compliance.expiring"
    ],
    tools:["quote_delivery","create_booking","track_delivery","reschedule_delivery","cancel_delivery","get_driver_eta","report_delivery_problem"],
    status:"adapter_ready"
  },
  "all-road-aid":{
    events:["recovery.job.created","recovery.job.assigned","recovery.agent.arriving","recovery.job.completed","recovery.job.exception"],
    tools:["request_recovery","track_recovery","get_agent_eta","report_recovery_problem"],
    status:"adapter_required"
  },
  sparesgrid:{
    events:["parts.quote.ready","parts.order.status","parts.supplier.reply"],
    tools:["vehicle_lookup","identify_part","check_fitment","search_suppliers","request_quote","create_order","track_order"],
    status:"adapter_ready"
  },
  autohashi:{
    events:["vehicle.match.found","inspection.updated","shipping.updated","document.required"],
    tools:["vehicle_search","auction_search","inspection_request","landed_cost","shipping_status","document_request"],
    status:"adapter_ready"
  },
  zivvo:{
    events:["vehicle.lead.created","valuation.ready","appointment.reminder","inspection.updated"],
    tools:["vehicle_lookup","stock_search","valuation_create","lead_qualify","appointment_book","inspection_request","crm_update"],
    status:"adapter_required"
  },
  dishbee:{
    events:["order.confirmed","order.ready","order.out_for_delivery","booking.reminder"],
    tools:["get_menu","create_order","track_order","book_table","report_order_problem"],
    status:"adapter_required"
  },
  mealdeck:{
    events:["group_order.opened","group_order.cutoff","order.confirmed","order.ready","order.out_for_delivery"],
    tools:["get_menu","create_order","group_order_status","track_order","create_payment_link"],
    status:"adapter_required"
  },
  haccora:{
    events:["compliance.alert","temperature.alert","checklist.overdue","incident.created"],
    tools:["get_alerts","get_compliance_status","get_temperature","complete_check","create_incident"],
    status:"adapter_ready"
  },
  kindelo:{
    events:["placement.updated","booking.updated","attendance.recorded","funding.updated","compliance.expiring"],
    tools:["provider_search","booking_status","placement_status","attendance_status","funding_status","document_request"],
    status:"adapter_required"
  },
  fastremit:{
    events:["remittance.quote.created","remittance.transfer.submitted","remittance.transfer.updated","remittance.document.required"],
    tools:["quote_transfer","beneficiary_lookup","transfer_status","document_request"],
    status:"adapter_required"
  },
  formationgenie:{
    events:["company.formation.updated","company.filing.due","company.filing.updated","company.psc.verification.required"],
    tools:["company_lookup","formation_status","filing_status","document_request"],
    status:"adapter_required"
  },
  lawquo:{
    events:["legal.enquiry.created","legal.triage.updated","legal.provider.matched","legal.appointment.updated"],
    tools:["legal_triage_status","provider_search","appointment_book","document_request"],
    status:"adapter_required"
  },
  veyumo:{
    events:["telecom.subscription.updated","telecom.sim.updated","telecom.usage.threshold","telecom.payment.updated"],
    tools:["plan_lookup","subscription_status","sim_status","usage_status"],
    status:"native"
  }
};

const ALIASES:Record<string,string>={
  "courier-broker":"courier-connect-hub",
  motoresq:"all-road-aid",
  "ahl-nikkah":"ahl-nikkah",
  ahlnikkah:"ahl-nikkah",
  kinderstars:"kindelo",
  "kindelo-gb":"kindelo",
  "kindelo-de":"kindelo",
  "haccora-gb":"haccora",
  "haccora-de":"haccora",
  "eventplanr-gb":"eventplanr",
  "eventplanr-de":"eventplanr",
  "xpertjobs-de":"xpertjobs",
  "zivvo-gb":"zivvo",
  "zivvo-de":"zivvo"
};

function generatedManifest(productKey:string):ConnectProductManifest|null{
  const canonical=ALIASES[productKey]??productKey;
  const product=OMNIQORA_PRODUCTS.find((item)=>item.key===productKey)
    ??OMNIQORA_PRODUCTS.find((item)=>item.key===canonical);
  if(!product)return null;

  const eventPrefixes=new Set<string>();
  const tools=new Set<string>();
  for(const moduleKey of product.defaultModules){
    const contract=MODULE_CONNECT_CONTRACTS[moduleKey];
    if(!contract)continue;
    for(const prefix of contract.eventPrefixes)eventPrefixes.add(prefix);
    for(const tool of contract.tools)tools.add(tool);
  }

  const explicit=EXPLICIT[canonical]??{};
  for(const tool of explicit.tools??[])tools.add(tool);

  return{
    product:productKey,
    name:product.name,
    events:[...(explicit.events??[])],
    eventPrefixes:[...eventPrefixes],
    tools:[...tools],
    modules:[...product.defaultModules],
    status:explicit.status??(product.status==="active"?"native":"adapter_required")
  };
}

export const CONNECT_PRODUCT_MANIFESTS:ConnectProductManifest[]=
  OMNIQORA_PRODUCTS
    .filter((product)=>product.kind!=="platform")
    .map((product)=>generatedManifest(product.key))
    .filter((value):value is ConnectProductManifest=>Boolean(value));

export function connectManifest(product:string){
  return generatedManifest(product);
}

export function connectEventAllowed(manifest:ConnectProductManifest,eventType:string){
  return manifest.events.includes(eventType)
    ||manifest.eventPrefixes.some((prefix)=>eventType.startsWith(prefix));
}

export function connectToolAllowed(manifest:ConnectProductManifest,tool:string){
  return manifest.tools.includes(tool);
}
