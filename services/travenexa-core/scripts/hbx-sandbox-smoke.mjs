#!/usr/bin/env node
// Read-only HBX evaluation smoke runner. Never accepts customer data or takes payment.
// Supply secrets through a PRIVATE environment or a secret manager, never the CLI args.
import { createHotelbedsSandboxClient } from '../hbx-hotels-sandbox.mjs';

async function main(){
  const mode=process.argv[2]||'status';
  if(!['status','availability'].includes(mode))
    throw new Error('Use status or availability. Booking is not available.');
  const apiKey=process.env.HBX_HOTEL_API_KEY;
  const apiSecret=process.env.HBX_HOTEL_API_SECRET;
  if(!apiKey || !apiSecret)throw new Error('HBX sandbox key and secret are required in private environment variables.');
  const client=createHotelbedsSandboxClient({apiKey,apiSecret});
  if(mode==='status'){
    const outcome=await client.status();
    process.stdout.write(JSON.stringify(outcome)+'\n');
    return;
  }
  const text=process.env.HBX_HOTEL_CODES||'';
  if(!/^[0-9,]+$/.test(text))throw new Error('Set HBX_HOTEL_CODES to approved numeric property codes.');
  const hotelCodes=text.split(',').map(Number);
  const checkIn=process.env.HBX_CHECK_IN;
  const nights=Number(process.env.HBX_NIGHTS||1);
  const adults=Number(process.env.HBX_ADULTS||2);
  const response=await client.availabilityByHotelCodes({hotelCodes,checkIn,nights,adults});
  process.stdout.write(JSON.stringify({
    environment:response.environment,
    customerBookable:false,
    supplier:'hotelbeds',
    hotelCodes:hotelCodes.length,
    matchingWholesaleRates:response.rates.length,
    needsRateRecheck:response.rates.filter(x=>x.rateType==='RECHECK').length,
    warning:'Diagnostic wholesale data only. No public offer, booking or payment exists.',
  })+'\n');
}
main().catch(error=>{
  // Never print upstream request bodies, card data, API headers or credentials.
  process.stderr.write('HBX sandbox smoke failed: '+(
    typeof error?.code==='string'?error.code:'configuration_or_supplier_unavailable')+'\n');
  process.exitCode=1;
});
