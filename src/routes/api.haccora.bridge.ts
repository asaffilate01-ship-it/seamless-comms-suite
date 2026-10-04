import {createFileRoute} from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import {serveHaccoraBridge} from "@/modules/haccora/haccora-bridge.server";
export const Route=createFileRoute("/api/haccora/bridge")({server:{handlers:{POST:({request})=>serveHaccoraBridge(request)}}});
