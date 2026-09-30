export type PaymentJson = null | boolean | number | string | PaymentJson[] | { [key:string]: PaymentJson };
export type PaymentJsonObject = { [key:string]: PaymentJson };

export type PaymentStatus="created"|"requires_action"|"pending"|"authorised"|"captured"|"failed"|"cancelled"|"partially_refunded"|"refunded";

export type CreatePaymentIntentRequest={
  idempotencyKey:string;amountMinor:number;currency:string;captureMode:"automatic"|"manual";
  customerRef?:string|null;purpose:string;contextType?:string|null;contextId?:string|null;
  metadata?:PaymentJsonObject;
};

export type ProviderPaymentIntent={
  providerRef:string;status:PaymentStatus;clientSecret?:string|null;redirectUrl?:string|null;
  metadata?:PaymentJsonObject;
};

export type ProviderCaptureRequest={
  amountMinor?:number;currency:string;idempotencyKey:string;
};

export type ProviderRefundRequest={
  amountMinor:number;currency:string;reason?:string|null;idempotencyKey:string;
};

export type ProviderRefund={
  providerRef:string;status:"pending"|"succeeded"|"failed"|"cancelled";
  metadata?:PaymentJsonObject;
};

export interface PaymentProvider {
  key:string;
  createIntent(
    request:CreatePaymentIntentRequest,
    credentials:Record<string,string>,
    config:Record<string,unknown>
  ):Promise<ProviderPaymentIntent>;
  capture?(
    providerRef:string,
    request:ProviderCaptureRequest,
    credentials:Record<string,string>,
    config:Record<string,unknown>
  ):Promise<ProviderPaymentIntent>;
  refund(
    providerRef:string,
    request:ProviderRefundRequest,
    credentials:Record<string,string>,
    config:Record<string,unknown>
  ):Promise<ProviderRefund>;
  verifyWebhook?(request:Request,credentials:Record<string,string>,config:Record<string,unknown>):Promise<unknown>;
}

export class PaymentProviderRegistry {
 private providers=new Map<string,PaymentProvider>();
 register(provider:PaymentProvider){
   if(this.providers.has(provider.key))throw new Error("Payment provider already registered: "+provider.key);
   this.providers.set(provider.key,provider);return this;
 }
 get(key:string){
   const p=this.providers.get(key);
   if(!p)throw new Error("Payment provider not installed: "+key);
   return p;
 }
}
