export type AccountingIntakePhase="opening_file"|"ongoing_file";
export type AccountingIntakeSource="mobile_camera"|"scanner"|"pdf"|"csv"|"email"|"upload"|"bank_feed"|"import";
export type AccountingSourceType="receipt"|"purchase_invoice"|"sales_invoice"|"bank_statement"|"credit_card_statement"|"opening_accounts"|"opening_trial_balance"|"journal"|"other";

export type AccountingIntakeBatch={
  id:string;tenantId:string;tenantProductId:string;practiceClientId:string;
  engagementId?:string|null;phase:AccountingIntakePhase;source:AccountingIntakeSource;
  status:"draft"|"uploaded"|"extracting"|"review"|"approved"|"posted"|"failed";
  periodStart?:string|null;periodEnd?:string|null;metadata:Record<string,unknown>;
};

export type ExtractedAccountingProposal={
  id:string;tenantId:string;batchId:string;documentId?:string|null;sourceType:AccountingSourceType;
  transactionDate?:string|null;counterparty?:string|null;description:string;
  grossMinor?:number|null;netMinor?:number|null;taxMinor?:number|null;currency:string;
  proposedAccountCode?:string|null;proposedTaxCode?:string|null;
  treatment:"income"|"revenue_expense"|"capital_expenditure"|"asset"|"liability"|"equity"|"private_nonbusiness"|"transfer"|"unknown";
  confidence:number;duplicateCandidate:boolean;
  proposedJournalLines:Array<{accountCode:string;debitMinor:number;creditMinor:number;memo?:string|null}>;
  evidenceRefs:string[];modelRunId?:string|null;
  reviewStatus:"proposed"|"needs_review"|"approved"|"rejected"|"posted";
};

export type AccountingReviewItem={
  id:string;tenantId:string;proposalId:string;
  issueType:"low_confidence"|"capex_vs_revenue"|"missing_tax"|"duplicate"|"unmatched_bank"|"unknown_account"|"accounting_policy"|"other";
  question:string;options:Array<{key:string;label:string;impact?:string|null}>;
  evidenceRefs:string[];status:"open"|"answered"|"resolved"|"dismissed";
};

export type NominalAccount={
  id:string;tenantId:string;practiceClientId:string;code:string;name:string;
  accountType:"asset"|"liability"|"equity"|"income"|"expense";
  normalBalance:"debit"|"credit";active:boolean;metadata:Record<string,unknown>;
};

export type AccountingJournal={
  id:string;tenantId:string;practiceClientId:string;engagementId?:string|null;
  journalDate:string;reference:string;description:string;sourceType:string;sourceRef:string;
  status:"draft"|"posted"|"reversed";postedAt?:string|null;revision:number;
};

export type AccountingJournalLine={
  journalId:string;accountId:string;description?:string|null;debitMinor:number;creditMinor:number;
  currency:string;taxCode?:string|null;sourceProposalId?:string|null;
};

export type FixedAssetRecord={
  id:string;tenantId:string;practiceClientId:string;sourceProposalId?:string|null;
  assetClass:string;description:string;acquisitionDate:string;costMinor:number;currency:string;
  depreciationMethod:"straight_line"|"reducing_balance"|"none";
  usefulLifeMonths?:number|null;openingAccumulatedDepreciationMinor:number;
  status:"proposed"|"active"|"disposed"|"rejected";metadata:Record<string,unknown>;
};

export type TrialBalanceRow={
  accountCode:string;accountName:string;accountType:string;
  openingDebitMinor:number;openingCreditMinor:number;
  periodDebitMinor:number;periodCreditMinor:number;
  closingDebitMinor:number;closingCreditMinor:number;
};

export type AccountsPreparationRun={
  id:string;tenantId:string;practiceClientId:string;engagementId?:string|null;
  periodStart:string;periodEnd:string;frameworkKey:string;
  openingTrialBalanceRef?:string|null;priorAccountsDocumentId?:string|null;
  status:"draft"|"building"|"review"|"approved"|"completed"|"failed";
  adjustmentCount:number;outputDocumentRefs:string[];reviewNotes?:string|null;
};

export const ACCOUNTING_AI_FEATURES={
  intake:"accounting_ai.intake",
  extraction:"accounting_ai.extraction",
  classification:"accounting_ai.classification",
  reviewQueue:"accounting_ai.review_queue",
  nominalLedger:"accounting_ai.nominal_ledger",
  journals:"accounting_ai.journals",
  trialBalance:"accounting_ai.trial_balance",
  assets:"accounting_ai.assets",
  accountsPrep:"accounting_ai.accounts_prep",
  bankMatching:"accounting_ai.bank_matching",
  duplicateDetection:"accounting_ai.duplicate_detection",
} as const;

export const ACCOUNTING_AI_EVENT_TYPES={
  intakeCreated:"accounting_ai.intake.created",
  extractionRequested:"accounting_ai.extraction.requested",
  proposalCreated:"accounting_ai.proposal.created",
  reviewRequired:"accounting_ai.review.required",
  proposalApproved:"accounting_ai.proposal.approved",
  journalPosted:"accounting_ai.journal.posted",
  assetCreated:"accounting_ai.asset.created",
  trialBalanceGenerated:"accounting_ai.trial_balance.generated",
  accountsPackPrepared:"accounting_ai.accounts_pack.prepared",
} as const;
