import type {
  PaymentProvider,
  PaymentProviderRegistry,
  PaymentStatus,
  CreatePaymentIntentRequest,
  ProviderCaptureRequest,
  ProviderRefundRequest,
} from "./contracts";

function scalar(value:unknown){return typeof value==="string"||typeof value==="number"||typeof value==="boolean";}

async function jsonRequest(url:string,init:RequestInit){
  const response=await fetch(url,{...init,redirect:"error",signal:AbortSignal.timeout(30000)});
  const text=await response.text();
  let body:any={};
  if(text){try{body=JSON.parse(text);}catch{body={raw:text.slice(0,1000)};}}
  if(!response.ok){
    const providerMessage=typeof body?.message==="string"?body.message:
      typeof body?.error?.message==="string"?body.error.message:
      typeof body?.errorCode==="string"?body.errorCode:"provider_request_failed";
    throw new Error("Payment provider request failed ("+response.status+"): "+providerMessage.slice(0,300));
  }
  return{response,body};
}

function stripeStatus(status:string):PaymentStatus{
  if(status==="requires_action")return"requires_action";
  if(status==="processing")return"pending";
  if(status==="requires_capture")return"authorised";
  if(status==="succeeded")return"captured";
  if(status==="canceled")return"cancelled";
  if(status==="requires_payment_method"||status==="requires_confirmation")return"created";
  return"pending";
}

function stripeHeaders(secret:string,config:Record<string,unknown>,idempotencyKey?:string){
  const headers:Record<string,string>={
    Authorization:"Bearer "+secret,
    "Content-Type":"application/x-www-form-urlencoded"
  };
  if(idempotencyKey)headers["Idempotency-Key"]=idempotencyKey.slice(0,255);
  if(typeof config.stripeAccount==="string"&&config.stripeAccount)headers["Stripe-Account"]=config.stripeAccount;
  return headers;
}

function stripeProvider():PaymentProvider{
  return{
    key:"payments.stripe",
    async createIntent(request,credentials,config){
      const secret=credentials.secret_key;
      if(!secret)throw new Error("Stripe secret key is not configured");
      const form=new URLSearchParams();
      form.set("amount",String(request.amountMinor));
      form.set("currency",request.currency.toLowerCase());
      form.set("capture_method",request.captureMode);
      form.set("automatic_payment_methods[enabled]","true");
      form.set("description",request.purpose.slice(0,500));
      if(request.customerRef)form.set("metadata[customer_ref]",request.customerRef.slice(0,500));
      if(request.contextType)form.set("metadata[context_type]",request.contextType.slice(0,500));
      if(request.contextId)form.set("metadata[context_id]",request.contextId.slice(0,500));
      for(const[key,value]of Object.entries(request.metadata??{})){
        if(scalar(value))form.set("metadata["+key.slice(0,40)+"]",String(value).slice(0,500));
      }
      const{body}=await jsonRequest("https://api.stripe.com/v1/payment_intents",{
        method:"POST",headers:stripeHeaders(secret,config,request.idempotencyKey),body:form
      });
      return{
        providerRef:String(body.id),
        status:stripeStatus(String(body.status??"")),
        clientSecret:typeof body.client_secret==="string"?body.client_secret:null,
        redirectUrl:body.next_action?.redirect_to_url?.url??null,
        metadata:{livemode:!!body.livemode}
      };
    },
    async capture(providerRef,request,credentials,config){
      const secret=credentials.secret_key;if(!secret)throw new Error("Stripe secret key is not configured");
      const form=new URLSearchParams();
      if(request.amountMinor!==undefined)form.set("amount_to_capture",String(request.amountMinor));
      const{body}=await jsonRequest("https://api.stripe.com/v1/payment_intents/"+encodeURIComponent(providerRef)+"/capture",{
        method:"POST",headers:stripeHeaders(secret,config,request.idempotencyKey),body:form
      });
      return{
        providerRef:String(body.id),status:stripeStatus(String(body.status??"")),
        clientSecret:typeof body.client_secret==="string"?body.client_secret:null,
        redirectUrl:null,metadata:{}
      };
    },
    async refund(providerRef,request,credentials,config){
      const secret=credentials.secret_key;if(!secret)throw new Error("Stripe secret key is not configured");
      const form=new URLSearchParams();
      form.set("payment_intent",providerRef);
      form.set("amount",String(request.amountMinor));
      if(request.reason&&["duplicate","fraudulent","requested_by_customer"].includes(request.reason)){
        form.set("reason",request.reason);
      }else if(request.reason){
        form.set("metadata[reason]",request.reason.slice(0,500));
      }
      const{body}=await jsonRequest("https://api.stripe.com/v1/refunds",{
        method:"POST",headers:stripeHeaders(secret,config,request.idempotencyKey),body:form
      });
      const status=String(body.status??"pending");
      return{
        providerRef:String(body.id),
        status:status==="succeeded"?"succeeded":status==="failed"?"failed":status==="canceled"?"cancelled":"pending",
        metadata:{paymentIntent:body.payment_intent??providerRef}
      };
    }
  };
}

function checkedAdyenBase(config:Record<string,unknown>){
  const raw=typeof config.baseUrl==="string"?config.baseUrl.trim():"";
  if(!raw)throw new Error("Adyen binding requires baseUrl for the correct test/live endpoint");
  const url=new URL(raw);
  if(url.protocol!=="https:"||url.username||url.password||url.search||url.hash)throw new Error("Invalid Adyen baseUrl");
  if(!(url.hostname.endsWith(".adyen.com")||url.hostname.endsWith(".adyenpayments.com")))throw new Error("Adyen baseUrl host is not allowed");
  return raw.replace(/\/$/,"");
}
function adyenMerchant(config:Record<string,unknown>){
  const value=(config.merchantAccount??config.merchant_account??config.externalAccountRef);
  if(typeof value!=="string"||!value)throw new Error("Adyen merchantAccount is required");
  return value;
}
function adyenHeaders(apiKey:string,idempotencyKey:string){
  return{"X-API-Key":apiKey,"Idempotency-Key":idempotencyKey.slice(0,64),"Content-Type":"application/json"};
}

function adyenProvider():PaymentProvider{
  return{
    key:"payments.adyen",
    async createIntent(request,credentials,config){
      const apiKey=credentials.api_key;if(!apiKey)throw new Error("Adyen API key is not configured");
      const base=checkedAdyenBase(config),merchantAccount=adyenMerchant(config);
      const returnUrl=typeof config.returnUrl==="string"?config.returnUrl:"";
      if(!returnUrl)throw new Error("Adyen returnUrl is required");
      const body:any={
        amount:{value:request.amountMinor,currency:request.currency},
        reference:request.idempotencyKey.slice(0,80),
        merchantAccount,returnUrl,channel:"Web"
      };
      if(typeof config.countryCode==="string")body.countryCode=config.countryCode;
      if(request.customerRef)body.shopperReference=request.customerRef.slice(0,80);
      const{body:result}=await jsonRequest(base+"/sessions",{
        method:"POST",headers:adyenHeaders(apiKey,request.idempotencyKey),body:JSON.stringify(body)
      });
      return{
        providerRef:String(result.id),status:"requires_action",
        clientSecret:typeof result.sessionData==="string"?result.sessionData:null,
        redirectUrl:typeof result.url==="string"?result.url:null,
        metadata:{sessionData:result.sessionData??null,reference:request.idempotencyKey}
      };
    },
    async capture(providerRef,request,credentials,config){
      const apiKey=credentials.api_key;if(!apiKey)throw new Error("Adyen API key is not configured");
      const base=checkedAdyenBase(config),merchantAccount=adyenMerchant(config);
      const body:any={merchantAccount,reference:request.idempotencyKey.slice(0,80)};
      if(request.amountMinor!==undefined)body.amount={value:request.amountMinor,currency:request.currency};
      const{body:result}=await jsonRequest(base+"/payments/"+encodeURIComponent(providerRef)+"/captures",{
        method:"POST",headers:adyenHeaders(apiKey,request.idempotencyKey),body:JSON.stringify(body)
      });
      return{providerRef:String(result.pspReference??providerRef),status:"pending",metadata:{captureReference:result.reference??null}};
    },
    async refund(providerRef,request,credentials,config){
      const apiKey=credentials.api_key;if(!apiKey)throw new Error("Adyen API key is not configured");
      const base=checkedAdyenBase(config),merchantAccount=adyenMerchant(config);
      const body:any={
        merchantAccount,amount:{value:request.amountMinor,currency:request.currency},
        reference:request.idempotencyKey.slice(0,80)
      };
      if(request.reason)body.merchantOrderReference=request.reason.slice(0,80);
      const{body:result}=await jsonRequest(base+"/payments/"+encodeURIComponent(providerRef)+"/refunds",{
        method:"POST",headers:adyenHeaders(apiKey,request.idempotencyKey),body:JSON.stringify(body)
      });
      return{providerRef:String(result.pspReference??request.idempotencyKey),status:"pending",metadata:{reference:result.reference??null}};
    }
  };
}

function minorExponent(currency:string,config:Record<string,unknown>){
  if(typeof config.minorUnitExponent==="number"&&Number.isInteger(config.minorUnitExponent)){
    return Math.max(0,Math.min(4,config.minorUnitExponent));
  }
  return currency==="CLP"?0:2;
}
function toMajor(amountMinor:number,currency:string,config:Record<string,unknown>){
  return amountMinor/Math.pow(10,minorExponent(currency,config));
}
function sumUpToken(credentials:Record<string,string>){
  const token=credentials.access_token??credentials.api_key;
  if(!token)throw new Error("SumUp access token/API key is not configured");
  return token;
}
function sumUpMerchant(config:Record<string,unknown>){
  const value=config.merchantCode??config.merchant_code??config.externalAccountRef;
  if(typeof value!=="string"||!value)throw new Error("SumUp merchant code is required");
  return value;
}
function sumUpStatus(status:string):PaymentStatus{
  const s=status.toUpperCase();
  if(["PAID","SUCCESSFUL","PAID_OUT"].includes(s))return"captured";
  if(["FAILED","CANCEL_FAILED","REFUND_FAILED"].includes(s))return"failed";
  if(["CANCELLED"].includes(s))return"cancelled";
  if(["REFUNDED"].includes(s))return"refunded";
  return"requires_action";
}

function sumUpProvider():PaymentProvider{
  return{
    key:"payments.sumup",
    async createIntent(request,credentials,config){
      const token=sumUpToken(credentials),merchantCode=sumUpMerchant(config);
      const body:any={
        checkout_reference:request.idempotencyKey.slice(0,64),
        amount:toMajor(request.amountMinor,request.currency,config),
        currency:request.currency,merchant_code:merchantCode,
        description:request.purpose.slice(0,500),
        hosted_checkout:{enabled:true}
      };
      if(typeof config.redirectUrl==="string")body.redirect_url=config.redirectUrl;
      if(request.customerRef)body.customer_id=request.customerRef.slice(0,100);
      const{body:result}=await jsonRequest("https://api.sumup.com/v0.1/checkouts",{
        method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},
        body:JSON.stringify(body)
      });
      return{
        providerRef:String(result.id),status:sumUpStatus(String(result.status??"PENDING")),
        clientSecret:null,redirectUrl:typeof result.hosted_checkout_url==="string"?result.hosted_checkout_url:null,
        metadata:{checkoutReference:result.checkout_reference??request.idempotencyKey,transactionId:result.transaction_id??null}
      };
    },
    async refund(providerRef,request,credentials,config){
      const token=sumUpToken(credentials),merchantCode=sumUpMerchant(config);
      const{body:checkout}=await jsonRequest("https://api.sumup.com/v0.1/checkouts/"+encodeURIComponent(providerRef),{
        method:"GET",headers:{Authorization:"Bearer "+token}
      });
      const transactionId=checkout.transaction_id??checkout.transactions?.find((t:any)=>t?.id)?.id;
      if(!transactionId)throw new Error("SumUp checkout has no refundable transaction yet");
      const url="https://api.sumup.com/v1.0/merchants/"+encodeURIComponent(merchantCode)+"/payments/"+encodeURIComponent(String(transactionId))+"/refunds";
      const response=await fetch(url,{
        method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},
        body:JSON.stringify({amount:toMajor(request.amountMinor,request.currency,config)}),
        redirect:"error",signal:AbortSignal.timeout(30000)
      });
      if(!response.ok)throw new Error("SumUp refund failed ("+response.status+")");
      return{providerRef:String(transactionId),status:"pending",metadata:{checkoutId:providerRef}};
    }
  };
}

export function createDefaultPaymentProviderRegistry(){
  const registry:PaymentProviderRegistry=new (requireRegistry())();
  return registry.register(stripeProvider()).register(adyenProvider()).register(sumUpProvider());
}

function requireRegistry(){
  // Keeps this file server-only and avoids accidentally exporting a singleton with credentials.
  return class extends (class {
    private providers=new Map<string,PaymentProvider>();
    register(provider:PaymentProvider){if(this.providers.has(provider.key))throw new Error("Payment provider already registered: "+provider.key);this.providers.set(provider.key,provider);return this;}
    get(key:string){const p=this.providers.get(key);if(!p)throw new Error("Payment provider not installed: "+key);return p;}
  }){};
}
