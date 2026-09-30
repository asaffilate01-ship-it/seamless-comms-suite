export type AccountingExtractionInput={
  tenantId:string;
  tenantProductId:string;
  practiceClientId:string;
  batchId:string;
  documents:Array<{
    intakeItemId:string;
    documentId:string;
    sourceType:string;
    storageRef?:string|null;
    mimeType?:string|null;
    fileName?:string|null;
  }>;
  openingContext?:{
    priorTrialBalanceRef?:string|null;
    priorAccountsDocumentId?:string|null;
  };
  policy:{
    confidenceThreshold:number;
    requireCapitalReview:boolean;
    requireUnknownReview:boolean;
  };
};

export type AccountingExtractionProposal={
  sourceRef:string;
  intakeItemId?:string|null;
  sourceType:string;
  transactionDate?:string|null;
  counterparty?:string|null;
  description:string;
  grossMinor?:number|null;
  netMinor?:number|null;
  taxMinor?:number|null;
  currency:string;
  proposedAccountCode?:string|null;
  proposedTaxCode?:string|null;
  treatment:"income"|"revenue_expense"|"capital_expenditure"|"asset"|"liability"|"equity"|"private_nonbusiness"|"transfer"|"unknown";
  confidence:number;
  duplicateCandidate:boolean;
  journalLines:Array<{accountCode:string;debitMinor:number;creditMinor:number;memo?:string|null}>;
  evidenceRefs:string[];
  reviewReasons:Array<"low_confidence"|"capex_vs_revenue"|"missing_tax"|"duplicate"|"unmatched_bank"|"unknown_account"|"accounting_policy"|"other">;
};

export type AccountingExtractionOutput={
  provider:string;
  model?:string|null;
  modelRunId?:string|null;
  proposals:AccountingExtractionProposal[];
};

export interface AccountingExtractionProvider{
  key:string;
  extract(input:AccountingExtractionInput,credentials:Record<string,string>,config:Record<string,unknown>):Promise<AccountingExtractionOutput>;
}

export class AccountingExtractionProviderRegistry{
  private providers=new Map<string,AccountingExtractionProvider>();
  register(provider:AccountingExtractionProvider){
    if(this.providers.has(provider.key))throw new Error("Accounting extraction provider already registered: "+provider.key);
    this.providers.set(provider.key,provider);return this;
  }
  get(key:string){
    const provider=this.providers.get(key);
    if(!provider)throw new Error("Accounting extraction provider not installed: "+key);
    return provider;
  }
}
