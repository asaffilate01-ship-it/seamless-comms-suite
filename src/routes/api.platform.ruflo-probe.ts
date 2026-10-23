import {createFileRoute} from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import {serveRufloProbeWorker} from "@/modules/agent-factory/ruflo-probe.server";

export const Route=createFileRoute("/api/platform/ruflo-probe")({
 server:{handlers:{POST:({request})=>serveRufloProbeWorker(request)}},
});
