/**
 * Deterministic, public synthetic evidence only.
 * No customer data, tenant business context, external API, LLM, tool, or connector.
 * These fixtures are NOT a replacement for a real read-only model/connector pilot.
 */
const FIXTURES = Object.freeze({
  "fixture.crm.pipeline": Object.freeze({
    caption: "Synthetic sales funnel for regression testing",
    rows: Object.freeze([
      Object.freeze({stage:"new",count:90}),
      Object.freeze({stage:"qualified",count:54}),
      Object.freeze({stage:"proposal",count:27}),
      Object.freeze({stage:"won",count:12}),
    ]),
  }),
  "fixture.dishbee.orders": Object.freeze({
    caption: "Synthetic food-order statuses for regression testing",
    rows: Object.freeze([
      Object.freeze({status:"received",count:80}),
      Object.freeze({status:"completed",count:66}),
      Object.freeze({status:"cancelled",count:8}),
      Object.freeze({status:"other",count:6}),
    ]),
  }),
  "fixture.finance.cashflow": Object.freeze({
    caption: "Synthetic, non-bank cash-flow observations for testing",
    rows: Object.freeze([
      Object.freeze({category:"opening",minor:1200000}),
      Object.freeze({category:"inflows",minor:420000}),
      Object.freeze({category:"outflows",minor:610000}),
      Object.freeze({category:"closing",minor:1010000}),
    ]),
  }),
});
export const permittedFixtures=Object.freeze(Object.keys(FIXTURES));

const safeUuid=value=>typeof value==="string"&&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);

export function createSyntheticReceipt(claim){
  if(!claim||typeof claim!=="object"||claim.syntheticOnly!==true||
    !safeUuid(claim.jobId)||!safeUuid(claim.admissionId)||
    !safeUuid(claim.tenantId)||!safeUuid(claim.employeeId)||
    !safeUuid(claim.taskId)||typeof claim.fixtureKey!=="string"||
    !Object.prototype.hasOwnProperty.call(FIXTURES,claim.fixtureKey)){
    throw new Error("Untrusted or non-synthetic worker claim refused");
  }
  if(!Number.isInteger(claim.employeeRevision)||claim.employeeRevision<1||
     !Number.isInteger(claim.taskRevision)||claim.taskRevision<1||
     claim.maxSteps!==1)throw new Error("Unbounded or stale rehearsal claim refused");
  const fixture=FIXTURES[claim.fixtureKey];
  let findings=[];
  switch(claim.fixtureKey){
    case "fixture.crm.pipeline":{
      const [newLeads,qualified,proposal,won]=fixture.rows.map(r=>r.count);
      findings=[
        {observation:"Qualified leads as a share of new leads",
          value:Number((qualified/newLeads*100).toFixed(1)),unit:"percent"},
        {observation:"Won deals as a share of proposals",
          value:Number((won/proposal*100).toFixed(1)),unit:"percent"},
      ];
      break;
    }
    case "fixture.dishbee.orders":{
      const rows=fixture.rows;
      const total=rows.reduce((sum,r)=>sum+r.count,0);
      const completion=rows.find(r=>r.status==="completed").count;
      const cancelled=rows.find(r=>r.status==="cancelled").count;
      findings=[
        {observation:"Completed synthetic orders",value:completion,unit:"orders"},
        {observation:"Cancellation fraction",
          value:Number((cancelled/total*100).toFixed(1)),unit:"percent"},
      ];
      break;
    }
    case "fixture.finance.cashflow":{
      const values=Object.fromEntries(fixture.rows.map(r=>[r.category,r.minor]));
      if(values.opening+values.inflows-values.outflows!==values.closing){
        throw new Error("Synthetic cash-flow fixture did not reconcile");
      }
      findings=[
        {observation:"Synthetic closing balance",value:values.closing,unit:"minor_currency_units"},
        {observation:"Synthetic net cash movement",value:values.inflows-values.outflows,unit:"minor_currency_units"},
      ];
      break;
    }
    default:throw new Error("Unrecognised synthetic fixture");
  }
  return Object.freeze({
    schemaVersion:1,
    fixtureKey:claim.fixtureKey,
    dataOrigin:"synthetic_fixture",
    summary:fixture.caption,
    findings,
    citations:[{ref:"synthetic:"+claim.fixtureKey,kind:"synthetic_fixture",notice:"Not a real business record"}],
    reviewRequired:true,
    customerDataRead:false,
    modelCalls:0,
    toolCalls:0,
    costMinor:0,
    noExternalActions:true,
  });
}
