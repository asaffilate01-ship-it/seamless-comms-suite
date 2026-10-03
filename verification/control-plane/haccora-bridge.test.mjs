import assert from "node:assert/strict";import {readFile} from "node:fs/promises";
const source=await readFile(new URL("../../src/modules/haccora/haccora-bridge.server.ts",import.meta.url),"utf8");
for(const token of["haccora.projection.write","haccora.compliance.read","haccora.dishbee-sync","HACCORA_UK_SYNC_SECRET","HACCORA_DE_SYNC_SECRET","sync_projection","compliance_summary"])assert(source.includes(token),token);
assert(source.includes('productKey:z.literal("dishbee")'));
assert(!source.includes("SUPABASE_SERVICE_ROLE_KEY"));
console.log("Dishbee to Haccora bridge contract verified");
