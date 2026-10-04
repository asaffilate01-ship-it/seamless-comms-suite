import {createFileRoute} from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import {serveDeliveryBroker} from "@/modules/dispatch/delivery-broker.service.server";

export const Route=createFileRoute("/api/platform/delivery")({
  server:{handlers:{POST:({request})=>serveDeliveryBroker(request)}},
});
