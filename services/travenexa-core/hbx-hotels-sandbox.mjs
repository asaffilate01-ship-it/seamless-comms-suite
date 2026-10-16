/**
 * Official HBX/Hotelbeds Hotels Booking API evaluation client — SERVER ONLY.
 * Fixed SANDBOX host. No live bookings, no customer payments, and no offer
 * promotion into the TraveNexa public engine. Source:
 * https://developer.hotelbeds.com/documentation/getting-started/
 * https://developer.hotelbeds.com/documentation/hotels/booking-api/workflow/
 */
import { createHash } from 'node:crypto';
import { validTravelDate, currencyDigits } from './policy.mjs';

const ORIGIN='https://api.test.hotelbeds.com';
const paths=Object.freeze({
  status:'/hotel-api/1.0/status',
  hotels:'/hotel-api/1.0/hotels',
  checkrates:'/hotel-api/1.0/checkrates',
});
const MAX_RESPONSE_BYTES=3_000_000;
export class HotelbedsSandboxError extends Error {
  constructor(reason) {
    super('Hotelbeds sandbox: '+reason);
    this.name='HotelbedsSandboxError';
    this.code=reason;
  }
}
const plain=value=>typeof value==='string'&&value.length>0&&!/[\x00-\x1f\x7f]/.test(value);
function secret(value) {
  return plain(value) && value.length>=8 && value.length<=512 && value.trim()===value;
}
export function hotelbedsSignature(apiKey, apiSecret, epochSeconds) {
  if (!secret(apiKey)||!secret(apiSecret)||
      !Number.isSafeInteger(epochSeconds)||epochSeconds<1)
    throw new HotelbedsSandboxError('invalid_credentials_or_timestamp');
  return createHash('sha256').update(apiKey+apiSecret+epochSeconds).digest('hex');
}
function fixedDecimalMinor(value,currency) {
  const digits=currencyDigits(currency);
  if (digits===null||digits===undefined||!Number.isInteger(digits)||digits<0||digits>3)
    return null;
  // Parse decimal **strings** exactly. Never round floats up/down for money.
  if (typeof value!=='string' || !/^(0|[1-9]\d{0,9})(?:\.\d{1,3})?$/.test(value))
    return null;
  const [whole,frac='']=value.split('.');
  if (frac.length>digits)return null;
  const amount=Number(whole)*10**digits+Number(frac.padEnd(digits,'0'));
  return Number.isSafeInteger(amount)&&amount>=0 ? amount : null;
}
export function normalizeHotelbedsRates(data,{limit=30}={}) {
  const list=data?.hotels?.hotels;
  if (!Array.isArray(list))return [];
  const out=[];
  for(const hotel of list.slice(0,20)){
    const currency=hotel?.currency;
    if(typeof currency!=='string'||!/^[A-Z]{3}$/.test(currency))continue;
    const code=hotel?.code;
    if(!Number.isSafeInteger(code)||code<=0)continue;
    const name=typeof hotel?.name==='string'&&hotel.name.length<=180?hotel.name:'Hotel '+code;
    if(!Array.isArray(hotel?.rooms))continue;
    for(const room of hotel.rooms.slice(0,12)){
      if(!Array.isArray(room?.rates))continue;
      for(const rate of room.rates.slice(0,8)){
        const netMinor=fixedDecimalMinor(rate?.net,currency);
        if(netMinor===null || typeof rate?.rateKey!=='string' ||
           rate.rateKey.length<10 || rate.rateKey.length>1500 ||
           rate.packaging===true)continue;
        // Rate types are NOT approval for retail ticketing; they describe
        // whether Hotelbeds needs an extra CheckRate call.
        if (!['RECHECK','BOOKABLE'].includes(rate.rateType))continue;
        out.push({
          hotelCode:code,hotelName:name,
          roomCode:typeof room.code==='string'?room.code:null,
          roomName:typeof room.name==='string'?room.name:null,
          rateKey:rate.rateKey,rateType:rate.rateType,
          netMinor,currency,
          taxesIncluded:rate.taxes?.allIncluded===true,
          hotelMandatorySellingRate:rate.hotelMandatory===true,
          sellingRateMinor:fixedDecimalMinor(rate.sellingRate,currency),
          paymentType:typeof rate.paymentType==='string'?rate.paymentType:null,
          cancellationPolicyAvailable:Array.isArray(rate.cancellationPolicies),
          product:'hotels',environment:'sandbox',
          inventoryStatus:'supplier_evaluation_only',
          customerBookable:false,
        });
        if(out.length>=Math.min(limit,30))return out;
      }
    }
  }
  return out;
}
async function readLimitedJSON(response){
  if(!response.ok)throw new HotelbedsSandboxError('http_upstream_unavailable');
  const len=Number(response.headers?.get?.('content-length'));
  if(Number.isFinite(len)&&len>MAX_RESPONSE_BYTES)
    throw new HotelbedsSandboxError('response_too_large');
  const reader=response.body?.getReader?.();
  if(!reader){
    const body=await response.text();
    if(Buffer.byteLength(body)>MAX_RESPONSE_BYTES)
      throw new HotelbedsSandboxError('response_too_large');
    try{return JSON.parse(body);}catch{throw new HotelbedsSandboxError('invalid_json_response');}
  }
  const chunks=[];let size=0;
  try {
    while(true){
      const {done,value}=await reader.read();
      if(done)break;
      size+=value.byteLength;
      if(size>MAX_RESPONSE_BYTES)throw new HotelbedsSandboxError('response_too_large');
      chunks.push(Buffer.from(value));
    }
    try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
    catch{throw new HotelbedsSandboxError('invalid_json_response');}
  }finally{reader.releaseLock();}
}
export function createHotelbedsSandboxClient({
  apiKey,apiSecret,fetchImpl=globalThis.fetch,now=()=>Date.now(),
}={}) {
  if(!secret(apiKey)||!secret(apiSecret)||typeof fetchImpl!=='function')
    throw new HotelbedsSandboxError('credentials_required');
  async function request(operation,body) {
    if(!Object.hasOwn(paths,operation))throw new HotelbedsSandboxError('operation_not_approved');
    const stamp=Math.floor(now()/1000);
    const method=operation==='status'?'GET':'POST';
    let response;
    try {
      response=await fetchImpl(ORIGIN+paths[operation],{
        method,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(12000),
        headers:{
          'Api-key':apiKey,
          'X-Signature':hotelbedsSignature(apiKey,apiSecret,stamp),
          'Accept':'application/json',
          ...(method==='POST'?{'Content-Type':'application/json'}:{}),
        },
        ...(method==='POST'?{body:JSON.stringify(body)}:{}),
      });
    }catch{throw new HotelbedsSandboxError('upstream_unavailable');}
    return readLimitedJSON(response);
  }
  async function status(){
    const reply=await request('status');
    return {environment:'sandbox',responseReceived:!!reply,bookingsEnabled:false};
  }
  async function availabilityByHotelCodes({hotelCodes,checkIn,nights,adults}={}) {
    if(!Array.isArray(hotelCodes)||hotelCodes.length<1||hotelCodes.length>10 ||
       hotelCodes.some(n=>!Number.isSafeInteger(n)||n<1||n>100000000)||
       new Set(hotelCodes).size!==hotelCodes.length ||
       !validTravelDate(checkIn) || !Number.isInteger(nights)||nights<1||nights>30 ||
       !Number.isInteger(adults)||adults<1||adults>12)
      throw new HotelbedsSandboxError('invalid_availability_request');
    const date=new Date(Date.parse(checkIn)+nights*86400000).toISOString().slice(0,10);
    const body={stay:{checkIn,checkOut:date},
      occupancies:[{rooms:1,adults,children:0}],hotels:{hotel:hotelCodes}};
    const reply=await request('hotels',body);
    return {environment:'sandbox',customerBookable:false,
      rates:normalizeHotelbedsRates(reply)};
  }
  async function checkRate(rateKey) {
    if(!plain(rateKey)||rateKey.length<10||rateKey.length>1500)
      throw new HotelbedsSandboxError('invalid_rate_key');
    const reply=await request('checkrates',{rooms:[{rateKey}]});
    return {environment:'sandbox',customerBookable:false,
      rates:normalizeHotelbedsRates(reply)};
  }
  // NO createOrder/book/cancel/charge here. Requires signed merchant and agency
  // approvals, a separately audited production adapter and supplier certification.
  return Object.freeze({environment:'sandbox',status,availabilityByHotelCodes,checkRate});
}
