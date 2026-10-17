/**
 * Finvessa TreasuryOS Phase 4 — deterministic read-only export adapters.
 *
 * Adapter names are vendor-neutral schemas, NOT connected bank/ERP APIs.
 * Normalisation is browser-local and cannot execute instructions, connect to
 * external systems, submit payments, or modify source data.
 */
import {isoDate, parseMinor, parseTable, treasuryDemoInput} from "./engine";

export type TreasurySourceKind = "bank_transactions" | "general_ledger";
export type TreasuryAdapterKey =
  | "bank-debit-credit-v1"
  | "bank-signed-v1"
  | "ledger-cash-debit-credit-v1"
  | "ledger-signed-v1";

export interface TreasurySourceProfile {
  key: TreasuryAdapterKey;
  label: string;
  kind: TreasurySourceKind;
  inputColumns: readonly string[];
  canonicalColumns: readonly string[];
  explanation: string;
  connectionStatus: "file_import_only";
}
export interface TreasurySourceMapRow {
  sourceRow: string;
  outputRow: string;
  recordId: string;
  accountId: string;
  currency: string;
  date: string;
  reference: string;
  amount: string;
}
export interface NormalizedTreasurySource {
  profileKey: TreasuryAdapterKey;
  kind: TreasurySourceKind;
  canonicalFile: "transactions.csv" | "ledger.csv";
  canonicalCSV: string;
  rows: TreasurySourceMapRow[];
  sourceRows: number;
  normalizedRows: number;
  sourceStatus: "normalized_unverified";
}

const bankColumns = [
  "transaction_id","account_id","currency","date","reference","amount","closing_balance"
] as const;
const ledgerColumns = [
  "ledger_id","account_id","currency","date","reference","amount"
] as const;

export const treasurySourceProfiles: readonly TreasurySourceProfile[] = [
  {
    key: "bank-debit-credit-v1",
    label: "Bank statement — money in / money out",
    kind: "bank_transactions",
    inputColumns: [
      "statement_line_id","bank_account","currency","booking_date",
      "description","money_in","money_out","closing_balance"
    ],
    canonicalColumns: bankColumns,
    explanation: "Bank money in increases cash; money out decreases it. A per-entry closing balance is mandatory.",
    connectionStatus: "file_import_only"
  },
  {
    key: "bank-signed-v1",
    label: "Bank statement — signed net movements",
    kind: "bank_transactions",
    inputColumns: [
      "transaction_ref","account_id","iso_currency","posted_on",
      "memo","net_amount","running_balance"
    ],
    canonicalColumns: bankColumns,
    explanation: "Positive values are cash receipts; negative values are cash payments. A running balance is mandatory.",
    connectionStatus: "file_import_only"
  },
  {
    key: "ledger-cash-debit-credit-v1",
    label: "Cash-account general ledger — debit / credit",
    kind: "general_ledger",
    inputColumns: [
      "journal_id","bank_account","currency","posting_date",
      "narrative","debit","credit"
    ],
    canonicalColumns: ledgerColumns,
    explanation: "For a debit-nature CASH ASSET account only: debit increases cash; credit decreases cash. Never apply to liability or clearing ledgers without separate configuration.",
    connectionStatus: "file_import_only"
  },
  {
    key: "ledger-signed-v1",
    label: "Cash-account general ledger — signed movements",
    kind: "general_ledger",
    inputColumns: [
      "entry_ref","bank_account","currency","posting_date",
      "narrative","net_amount"
    ],
    canonicalColumns: ledgerColumns,
    explanation: "Signed cash-asset GL amounts must use receipts positive, payments negative. Do not infer debit/credit conventions.",
    connectionStatus: "file_import_only"
  }
];

function field(value: string, title: string, evidence: string, max = 200): string {
  const v = value.trim();
  if (!v || v.length > max || /[\x00-\x1f\x7f]/.test(v))
    throw new Error(evidence + ": " + title + " is empty, too long or contains control characters.");
  if (/^[=+@-]/.test(v))
    throw new Error(evidence + ": " + title + " begins with a spreadsheet formula trigger. Manual review required.");
  return v;
}
function identifier(value: string, title: string, evidence: string): string {
  const v=field(value,title,evidence,100);
  if(!/^[A-Za-z0-9][A-Za-z0-9 _.:/-]*$/.test(v))
    throw new Error(evidence + ": " + title + " contains unsupported identifier characters.");
  return v;
}
function signed(value: string, currency: string, evidence: string): string {
  const v = value.trim();
  if (!v || parseMinor(v,currency,evidence) === 0)
    throw new Error(evidence + ": zero or empty signed cash movement cannot be imported.");
  return v;
}
function debitCredit(
  positive: string,
  negative: string,
  currency: string,
  evidence: string
): string {
  const a=positive.trim(),b=negative.trim();
  if(Boolean(a)===Boolean(b))
    throw new Error(evidence + ": exactly one positive-side or negative-side amount must be provided.");
  const value=a||b;
  const minor=parseMinor(value,currency,evidence);
  if(minor<=0 || value.startsWith("-") || value.startsWith("+"))
    throw new Error(evidence + ": split debit/credit values must be strictly positive unsigned amounts.");
  return a ? a : "-" + b;
}
function quote(value: string): string {
  return '"' + value.replace(/"/g,'""') + '"';
}
export function renderTreasuryCSV(columns:readonly string[],rows:readonly (readonly string[])[]):string {
  return [columns,...rows].map(row=>row.map(quote).join(",")).join("\r\n")+"\r\n";
}
function profileFor(key:TreasuryAdapterKey):TreasurySourceProfile {
  const profile=treasurySourceProfiles.find(p=>p.key===key);
  if(!profile) throw new Error("Unsupported or unverified treasury export adapter.");
  return profile;
}
export function normalizeTreasuryExport(input:{
  profileKey:TreasuryAdapterKey;
  csv:string;
}):NormalizedTreasurySource {
  const profile=profileFor(input.profileKey);
  const source=profile.key+".csv";
  const rows=parseTable(input.csv,source,[...profile.inputColumns]);
  if(!rows.length)throw new Error("This financial export does not contain transaction records.");
  const seen=new Set<string>();
  const canon:string[][]=[];
  const maps:TreasurySourceMapRow[]=[];
  for(const [index,row] of rows.entries()){
    const {data,evidence}=row;
    let id="",accountId="",currency="",date="",reference="",amount="",closing="";
    if(profile.key==="bank-debit-credit-v1"){
      id=identifier(data.statement_line_id,"Statement line ID",evidence);
      accountId=identifier(data.bank_account,"Bank account",evidence);
      currency=data.currency.toUpperCase();
      date=isoDate(data.booking_date,evidence);
      reference=field(data.description,"Narrative",evidence);
      amount=debitCredit(data.money_in,data.money_out,currency,evidence);
      closing=data.closing_balance.trim();
    }else if(profile.key==="bank-signed-v1"){
      id=identifier(data.transaction_ref,"Transaction ref",evidence);
      accountId=identifier(data.account_id,"Bank account",evidence);
      currency=data.iso_currency.toUpperCase();
      date=isoDate(data.posted_on,evidence);
      reference=field(data.memo,"Memo",evidence);
      amount=signed(data.net_amount,currency,evidence);
      closing=data.running_balance.trim();
    }else if(profile.key==="ledger-cash-debit-credit-v1"){
      id=identifier(data.journal_id,"Journal ID",evidence);
      accountId=identifier(data.bank_account,"Cash account",evidence);
      currency=data.currency.toUpperCase();
      date=isoDate(data.posting_date,evidence);
      reference=field(data.narrative,"Narrative",evidence);
      amount=debitCredit(data.debit,data.credit,currency,evidence);
    }else{
      id=identifier(data.entry_ref,"Entry ref",evidence);
      accountId=identifier(data.bank_account,"Cash account",evidence);
      currency=data.currency.toUpperCase();
      date=isoDate(data.posting_date,evidence);
      reference=field(data.narrative,"Narrative",evidence);
      amount=signed(data.net_amount,currency,evidence);
    }
    if(!/^[A-Z]{3}$/.test(currency))throw new Error(evidence+": invalid ISO currency.");
    parseMinor(amount,currency,evidence);
    if(profile.kind==="bank_transactions"){
      if(!closing)throw new Error(evidence+": independently supplied closing balance is required.");
      parseMinor(closing,currency,evidence);
    }
    const scoped=accountId+"\u0000"+id;
    if(seen.has(scoped))throw new Error(evidence+": duplicate source record ID for this cash account.");
    seen.add(scoped);
    const outRow=canon.length+2;
    const canonicalFile=profile.kind==="bank_transactions"?"transactions.csv":"ledger.csv";
    const normalized=profile.kind==="bank_transactions"
      ? [id,accountId,currency,date,reference,amount,closing]
      : [id,accountId,currency,date,reference,amount];
    canon.push(normalized);
    maps.push({
      sourceRow:evidence,outputRow:canonicalFile+":row:"+outRow,
      recordId:id,accountId,currency,date,reference,amount
    });
  }
  return {
    profileKey:profile.key,kind:profile.kind,
    canonicalFile:profile.kind==="bank_transactions"?"transactions.csv":"ledger.csv",
    canonicalCSV:renderTreasuryCSV(profile.canonicalColumns,canon),
    sourceRows:rows.length,normalizedRows:canon.length,rows:maps,
    sourceStatus:"normalized_unverified"
  };
}

/** A local test fixture. All samples are derived from explicit synthetic Phase 1 data. */
export function syntheticTreasuryExport(key:TreasuryAdapterKey,date:string):string{
  const profile=profileFor(key);
  const demo=treasuryDemoInput(date);
  const bank=profile.kind==="bank_transactions";
  const src=parseTable(bank?demo.transactionsCSV:demo.ledgerCSV??"",
    bank?"transactions.csv":"ledger.csv",
    bank?[...bankColumns]:[...ledgerColumns]);
  const rows=src.map(({data})=>{
    const amount=data.amount;
    const incoming=!amount.startsWith("-");
    const absolute=incoming?amount:amount.slice(1);
    if(key==="bank-debit-credit-v1")return [
      data.transaction_id,data.account_id,data.currency,data.date,data.reference,
      incoming?absolute:"",incoming?"":absolute,data.closing_balance
    ];
    if(key==="bank-signed-v1")return [
      data.transaction_id,data.account_id,data.currency,data.date,data.reference,
      amount,data.closing_balance
    ];
    if(key==="ledger-cash-debit-credit-v1")return [
      data.ledger_id,data.account_id,data.currency,data.date,data.reference,
      incoming?absolute:"",incoming?"":absolute
    ];
    return [
      data.ledger_id,data.account_id,data.currency,data.date,data.reference,amount
    ];
  });
  return renderTreasuryCSV(profile.inputColumns,rows);
}
