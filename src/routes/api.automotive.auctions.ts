import {createFileRoute} from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import {serveAutomotiveAuctionRuntime} from "@/modules/automotive/auction-runtime.server";

export const Route=createFileRoute("/api/automotive/auctions")({
  server:{handlers:{POST:({request})=>serveAutomotiveAuctionRuntime(request)}},
});
