import {createFileRoute} from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import {serveFinanceConnectorCatalogue} from "@/modules/finance-connectors/catalogue.server";
export const Route=createFileRoute("/api/finance/catalogue")({
 server:{handlers:{POST:({request})=>serveFinanceConnectorCatalogue(request)}}
});