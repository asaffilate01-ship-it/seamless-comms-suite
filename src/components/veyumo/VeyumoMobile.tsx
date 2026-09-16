import { supabase } from "@/integrations/supabase/client";
import { VeyumoPanel, type VeyumoCall } from "./VeyumoPanel";
const call: VeyumoCall = async (command) => {
  const { data, error } = await supabase.functions.invoke("veyumo-bridge", { body: command });
  if (error) {
    let code = "bridge_unavailable";
    try {
      const response = (error as { context?: Response }).context;
      if (response) code = (await response.json()).error || code;
    } catch {
      /* Use the safe generic message. */
    }
    throw new Error(code);
  }
  return data;
};
export function VeyumoMobile() {
  return <VeyumoPanel call={call} appName="Omniqora" />;
}

