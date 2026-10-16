// Read-only Omniqora tool surface. TraveNexa remains authoritative for real offers.
// Tool names never grant booking, payment, refund, ticketing or package-organiser rights.
export const TRAVEL_AI_TOOLS = Object.freeze([
  Object.freeze({
    name:'travel.search',effect:'read_only',
    description:'Search live, approved third-party travel inventory for the authenticated TraveNexa tenant.',
    requires:'travenexa-tenant-server-token',input:'travel-search-v1',
  }),
  Object.freeze({
    name:'travel.compare',effect:'read_only',
    description:'Compare verified live offers in the SAME currency for one travel service. Never claim a package price.',
    requires:'travenexa-tenant-server-token',input:'travel-search-v1',
  }),
]);
export async function runTravelAiTool(engine,tenantId,{tool,input}={}) {
  if (!TRAVEL_AI_TOOLS.some(item=>item.name===tool))
    return {httpStatus:403,status:'blocked',reason:'ai_tool_not_permitted'};
  const result=await engine.search(tenantId,input);
  if (result.status!=='live') return result;
  if (tool==='travel.search') return result;
  const grouped=Object.groupBy(result.offers,offer=>offer.currency);
  const comparisons=Object.entries(grouped).map(([currency,offers])=>({
    currency,offers:offers.slice().sort((a,b)=>a.amount-b.amount),
    priceComparisonScope:'within_currency_only',
  }));
  return {httpStatus:200,status:'live',comparisons,
    notice:'Separate supplier offers, not a TraveNexa package. Check supplier terms and prices before booking.'};
}
