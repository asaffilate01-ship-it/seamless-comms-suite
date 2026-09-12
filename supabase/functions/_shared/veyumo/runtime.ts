import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { BridgeError, readBody } from "./protocol.mjs";
export const env = (key: string) => Deno.env.get(key) || "";
export const db = () =>
  createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
export function check(result: any) {
  if (result.error) throw new BridgeError("storage_unavailable", 503);
  return result.data;
}
export async function body(req: Request) {
  try {
    return JSON.parse(await readBody(req));
  } catch (e) {
    if (e instanceof BridgeError) throw e;
    throw new BridgeError("invalid_json");
  }
}
export const json = (data: unknown, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...extra },
  });
export function fail(e: unknown) {
  return json(
    { error: e instanceof BridgeError ? e.message : "service_unavailable" },
    e instanceof BridgeError ? e.status : 503,
  );
}
export function originHeaders(req: Request) {
  const origin = req.headers.get("origin");
  const allowed = env("VEYUMO_ALLOWED_ORIGINS")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  if (origin && !allowed.includes(origin)) throw new BridgeError("origin_not_allowed", 403);
  return origin
    ? {
        "access-control-allow-origin": origin,
        vary: "Origin",
        "access-control-allow-headers":
          "authorization,apikey,content-type,x-client-info,x-supabase-client-platform,x-supabase-client-platform-version,x-supabase-client-runtime,x-supabase-client-runtime-version",
        "access-control-allow-methods": "POST,OPTIONS",
      }
    : {};
}
