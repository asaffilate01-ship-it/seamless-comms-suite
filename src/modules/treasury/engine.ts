/**
 * Finvessa Treasury Analyst Workbench — deterministic, browser-local pilot engine.
 *
 * This is not a live bank connector, a trading system, an autonomous payment
 * service or a substitute for independent financial review.
 *
 * Money is held as SAFE INTEGERS in ISO currency minor units. Never add
 * balances of different currencies or infer FX conversion rates.
 */
export type TreasurySeverity = "blocking" | "warning" | "info";
export type ForecastCertainty = "committed" | "expected";
export interface TreasuryIssue {
  code: string;
  severity: TreasurySeverity;
  message: string;
  evidence: string;
  accountId?: string;
}
export interface TreasuryAccountPosition {
  accountId: string;
  currency: string;
  openingDate: string;
  lastEvidenceDate: string;
  openingMinor: number;
  balanceMinor: number;
  transactions: number;
  checkedBalances: number;
  missingBalances: number;
  reconciled: boolean;
}
export interface TreasuryForecastWeek {
  currency: string;
  week: number;
  weekEnd: string;
  openingMinor: number;
  committedMinor: number;
  expectedMinor: number;
  closingBaseMinor: number;
  closingDownsideMinor: number;
  downsideMovementMinor: number;
  sourceRows: string[];
}
export interface TreasuryReport {
  status: "blocked" | "review_required" | "checked";
  reportDate: string;
  generatedAt: string;
  mode: "synthetic_demo" | "local_import";
  positions: TreasuryAccountPosition[];
  currencyPositions: { currency: string; balanceMinor: number; accounts: number }[];
  weeks: TreasuryForecastWeek[];
  issues: TreasuryIssue[];
  counts: { accounts: number; transactions: number; forecasts: number; reconciled: number };
  sources: { file: string; rows: number }[];
  methodology: string[];
}
export interface TreasuryInputs {
  accountsCSV: string;
  transactionsCSV: string;
  forecastCSV: string;
  reportDate: string;
  demo?: boolean;
}
type Row = { data: Record<string, string>; evidence: string };
const MAX_CSV = 2_000_000;
const MAX_ROWS = 20_000;
const DECIMALS: Record<string, number> = {
  GBP: 2, EUR: 2, USD: 2, CHF: 2, AED: 2, PKR: 2,
  CAD: 2, AUD: 2, JPY: 0, KWD: 3, BHD: 3, OMR: 3
};

function csvRows(csv: string, source: string): string[][] {
  if (csv.length > MAX_CSV) throw new Error(source + ": maximum size is 2 MB for this pilot.");
  const rows: string[][] = [];
  let fields: string[] = [], field = "", quoted = false, closedQuote = false;
  const pushField = () => { fields.push(field); field = ""; closedQuote = false; };
  const pushRow = () => {
    pushField();
    if (fields.some(x => x.trim())) rows.push(fields);
    fields = [];
    if (rows.length > MAX_ROWS + 1) throw new Error(source + ": 20,000-row pilot limit exceeded.");
  };
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i];
    if (c === '"') {
      if (quoted && csv[i + 1] === '"') { field += '"'; i++; }
      else if (quoted) { quoted = false; closedQuote = true; }
      else if (!field && !closedQuote) quoted = true;
      else throw new Error(source + ": unexpected quotation mark.");
    } else if (!quoted && (c === "," || c === "\n" || c === "\r")) {
      if (c === ",") pushField();
      else { if (c === "\r" && csv[i + 1] === "\n") i++; pushRow(); }
    } else {
      if (closedQuote && c !== " " && c !== "\t") throw new Error(source + ": data after closing quote.");
      if (!closedQuote) field += c;
    }
  }
  if (quoted) throw new Error(source + ": unclosed CSV quotation mark.");
  if (field || fields.length || closedQuote) pushRow();
  return rows;
}
function parseTable(csv: string, source: string, required: string[], optional = false): Row[] {
  if (optional && !csv.trim()) return [];
  const raw = csvRows(csv.replace(/^\uFEFF/, ""), source);
  if (!raw.length) throw new Error(source + ": a header row is required.");
  const header = raw[0].map(v => v.trim().toLowerCase());
  if (new Set(header).size !== header.length) throw new Error(source + ": duplicated column header.");
  const missing = required.filter(v => !header.includes(v));
  if (missing.length) throw new Error(source + ": missing column(s) " + missing.join(", "));
  return raw.slice(1).map((cells, index) => {
    if (cells.length !== header.length) throw new Error(source + " row " + (index + 2) + ": incorrect column count.");
    const data: Record<string, string> = {};
    header.forEach((h, i) => { data[h] = cells[i].trim(); });
    return { data, evidence: source + ":row:" + (index + 2) };
  });
}
function isoDate(value: string, evidence: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(evidence + ": invalid date. Use YYYY-MM-DD.");
  const date = new Date(value + "T12:00:00Z");
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value)
    throw new Error(evidence + ": impossible calendar date.");
  return value;
}
function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function ageDays(later: string, earlier: string): number {
  return Math.round((Date.parse(later + "T12:00:00Z") - Date.parse(earlier + "T12:00:00Z")) / 86_400_000);
}
function safeAdd(a: number, b: number): number {
  const n = a + b;
  if (!Number.isSafeInteger(n)) throw new Error("Financial amount exceeds safe integer precision. Processing stopped.");
  return n;
}
function currencyDecimals(currency: string, evidence: string): number {
  if (!Object.prototype.hasOwnProperty.call(DECIMALS, currency))
    throw new Error(evidence + ": unsupported currency " + currency + ". Configure a tested currency precision before use.");
  return DECIMALS[currency];
}
/** Convert decimal text to exact ISO currency minor units with no float rounding. */
export function parseMinor(value: string, currency: string, evidence: string): number {
  const places = currencyDecimals(currency, evidence);
  const pattern = new RegExp("^([+-]?)(\\d+)" + (places ? "(?:\\.(\\d{1," + places + "}))?" : "") + "$");
  const m = value.trim().match(pattern);
  if (!m) throw new Error(evidence + ": invalid " + currency + " amount " + JSON.stringify(value) + ".");
  const factor = 10 ** places;
  const whole = Number(m[2]);
  const decimal = places ? Number((m[3] || "").padEnd(places, "0")) : 0;
  const n = (whole * factor + decimal) * (m[1] === "-" ? -1 : 1);
  if (!Number.isSafeInteger(n)) throw new Error(evidence + ": amount outside safe numeric range.");
  return n;
}
export function formatMinor(amountMinor: number, currency: string): string {
  if (!Number.isSafeInteger(amountMinor)) throw new Error("Invalid monetary value.");
  const places = currencyDecimals(currency, "Formatting");
  const sign = amountMinor < 0 ? "-" : "";
  const absolute = BigInt(Math.abs(amountMinor));
  const factor = BigInt(10 ** places);
  const whole = (absolute / factor).toLocaleString("en-GB");
  const decimal = places ? "." + String(absolute % factor).padStart(places, "0") : "";
  return sign + currency + " " + whole + decimal;
}
function issue(code: string, severity: TreasurySeverity, message: string, evidence: string, accountId?: string): TreasuryIssue {
  return { code, severity, message, evidence, accountId };
}

export function analyseTreasury(input: TreasuryInputs): TreasuryReport {
  const reportDate = isoDate(input.reportDate, "Report date");
  const accounts = parseTable(input.accountsCSV, "accounts.csv", ["account_id", "currency", "as_of", "opening_balance"]);
  const transactions = parseTable(input.transactionsCSV, "transactions.csv", ["transaction_id", "account_id", "currency", "date", "reference", "amount", "closing_balance"]);
  const forecasts = parseTable(input.forecastCSV, "forecast.csv", ["account_id", "date", "reference", "amount", "certainty"], true);
  if (!accounts.length) throw new Error("At least one bank account and opening balance is required.");
  if (!transactions.length) throw new Error("At least one posted transaction is required for reconciliation.");
  const issues: TreasuryIssue[] = [];
  const state = new Map<string, TreasuryAccountPosition>();
  const accountBlocked = new Set<string>();
  const toWarn = (code: string, sev: TreasurySeverity, message: string, evidence: string, accountId?: string) => {
    issues.push(issue(code, sev, message, evidence, accountId));
    if (sev === "blocking" && accountId) accountBlocked.add(accountId);
  };
  const seenAccounts = new Set<string>();
  accounts.forEach(({data, evidence}) => {
    const accountId = data.account_id.trim();
    if (!accountId || accountId.length > 100) throw new Error(evidence + ": invalid account ID.");
    if (seenAccounts.has(accountId)) throw new Error(evidence + ": duplicate account ID " + accountId + ".");
    seenAccounts.add(accountId);
    const currency = data.currency.toUpperCase();
    const openingDate = isoDate(data.as_of, evidence);
    if (openingDate > reportDate) throw new Error(evidence + ": opening balance is dated after the report date.");
    const openingMinor = parseMinor(data.opening_balance, currency, evidence);
    state.set(accountId, {
      accountId, currency, openingDate, lastEvidenceDate: openingDate,
      openingMinor, balanceMinor: openingMinor, transactions: 0, checkedBalances: 0,
      missingBalances: 0, reconciled: true
    });
  });
  const seenTx = new Map<string, string>();
  const sorted = transactions.map(row => ({
    row, date: isoDate(row.data.date, row.evidence)
  })).sort((a, b) => a.date.localeCompare(b.date) || Number(a.row.evidence.split(":").at(-1)) - Number(b.row.evidence.split(":").at(-1)));
  sorted.forEach(({row, date}) => {
    const {data, evidence} = row;
    const account = state.get(data.account_id);
    if (!account) throw new Error(evidence + ": unknown account " + data.account_id + ".");
    if (account.currency !== data.currency.toUpperCase()) throw new Error(evidence + ": transaction currency does not match bank account.");
    if (!data.transaction_id || data.transaction_id.length > 100) throw new Error(evidence + ": transaction ID is required.");
    const amountMinor = parseMinor(data.amount, account.currency, evidence);
    const closingMinor = data.closing_balance ? parseMinor(data.closing_balance, account.currency, evidence) : null;
    const key = account.accountId + "\u0000" + data.transaction_id;
    const fingerprint = JSON.stringify([date, amountMinor, closingMinor, data.reference]);
    const prior = seenTx.get(key);
    if (prior !== undefined) {
      toWarn(prior === fingerprint ? "DUPLICATE_TRANSACTION" : "CONFLICTING_TRANSACTION_ID",
        prior === fingerprint ? "warning" : "blocking",
        "Repeated transaction ID was excluded from totals" + (prior !== fingerprint ? "; conflicting values require investigation." : "."),
        evidence, account.accountId);
      return;
    }
    seenTx.set(key, fingerprint);
    if (date <= account.openingDate) {
      toWarn("TRANSACTION_BEFORE_OPENING", "blocking", "Transaction is not after the opening balance date; excluded.", evidence, account.accountId);
      return;
    }
    if (date > reportDate) {
      toWarn("FUTURE_POSTED_TRANSACTION", "blocking", "Future-dated transaction excluded from today's cash position.", evidence, account.accountId);
      return;
    }
    account.balanceMinor = safeAdd(account.balanceMinor, amountMinor);
    account.transactions += 1;
    account.lastEvidenceDate = date > account.lastEvidenceDate ? date : account.lastEvidenceDate;
    if (closingMinor === null) {
      account.missingBalances++;
      toWarn("MISSING_CLOSING_BALANCE", "warning", "Transaction has no independently supplied closing balance.", evidence, account.accountId);
    } else {
      account.checkedBalances++;
      if (closingMinor !== account.balanceMinor)
        toWarn("BALANCE_MISMATCH", "blocking",
          "Reported closing balance " + formatMinor(closingMinor, account.currency) +
          " differs from calculated " + formatMinor(account.balanceMinor, account.currency) + ".",
          evidence, account.accountId);
    }
  });
  state.forEach(account => {
    if (ageDays(reportDate, account.lastEvidenceDate) > 7)
      toWarn("STALE_POSITION", "warning", "Latest statement evidence is more than seven days old.", "accounts.csv:" + account.accountId, account.accountId);
    if (!account.transactions)
      toWarn("NO_POSTED_ACTIVITY", "warning", "No valid posted transactions for this account.", "accounts.csv:" + account.accountId, account.accountId);
    account.reconciled = !accountBlocked.has(account.accountId) &&
      account.missingBalances === 0 && account.checkedBalances === account.transactions;
  });
  const validForecasts: {
    accountId: string; currency: string; date: string; amountMinor: number;
    certainty: ForecastCertainty; evidence: string
  }[] = [];
  forecasts.forEach(({data, evidence}) => {
    const account = state.get(data.account_id);
    if (!account) throw new Error(evidence + ": unknown forecast account " + data.account_id + ".");
    const date = isoDate(data.date, evidence);
    if (data.certainty !== "committed" && data.certainty !== "expected")
      throw new Error(evidence + ": certainty must be committed or expected.");
    const amountMinor = parseMinor(data.amount, account.currency, evidence);
    if (date <= reportDate) {
      toWarn("PAST_FORECAST", "warning", "Forecast item at or before the reporting date was excluded.", evidence, account.accountId);
      return;
    }
    if (date > addDays(reportDate, 91)) {
      toWarn("OUTSIDE_13_WEEK_HORIZON", "info", "Forecast item is beyond the 13-week reporting period.", evidence, account.accountId);
      return;
    }
    validForecasts.push({accountId: account.accountId, currency: account.currency, date, amountMinor,
      certainty: data.certainty, evidence});
  });
  if (!validForecasts.length)
    toWarn("NO_VERIFIED_FORECAST_INPUT", "warning",
      "No eligible dated cash-flow obligations supplied; a forecast cannot be substantiated.", "forecast.csv");
  const totals = new Map<string, {currency: string; balanceMinor: number; accounts: number}>();
  state.forEach(account => {
    const total = totals.get(account.currency) || {currency: account.currency, balanceMinor: 0, accounts: 0};
    total.balanceMinor = safeAdd(total.balanceMinor, account.balanceMinor);
    total.accounts++;
    totals.set(account.currency, total);
  });
  const currencyPositions = [...totals.values()].sort((a, b) => a.currency.localeCompare(b.currency));
  const weeks: TreasuryForecastWeek[] = [];
  if (validForecasts.length) {
    currencyPositions.forEach(position => {
      let base = position.balanceMinor, downside = position.balanceMinor;
      for (let week = 1; week <= 13; week++) {
        const weekEnd = addDays(reportDate, week * 7);
        const previousEnd = addDays(reportDate, (week - 1) * 7);
        const due = validForecasts.filter(x => x.currency === position.currency &&
          x.date > previousEnd && x.date <= weekEnd);
        let committedMinor = 0, expectedMinor = 0, downsideMovementMinor = 0;
        due.forEach(x => {
          if (x.certainty === "committed") committedMinor = safeAdd(committedMinor, x.amountMinor);
          else expectedMinor = safeAdd(expectedMinor, x.amountMinor);
          if (x.certainty === "committed" || x.amountMinor < 0)
            downsideMovementMinor = safeAdd(downsideMovementMinor, x.amountMinor);
        });
        const openingMinor = base;
        base = safeAdd(base, safeAdd(committedMinor, expectedMinor));
        downside = safeAdd(downside, downsideMovementMinor);
        weeks.push({
          currency: position.currency, week, weekEnd, openingMinor, committedMinor, expectedMinor,
          closingBaseMinor: base, closingDownsideMinor: downside, downsideMovementMinor,
          sourceRows: due.map(x => x.evidence)
        });
        if (base < 0 || downside < 0)
          toWarn("PROJECTED_CASH_SHORTFALL", "warning",
            position.currency + " cash forecast falls below zero in " + (base < 0 ? "base" : "downside") + " scenario.",
            "forecast.csv:week:" + week + ":" + position.currency);
      }
    });
  }
  const positions = [...state.values()].sort((a, b) => a.accountId.localeCompare(b.accountId));
  return {
    status: issues.some(x => x.severity === "blocking") ? "blocked" :
      issues.some(x => x.severity === "warning") ? "review_required" : "checked",
    reportDate, generatedAt: new Date().toISOString(), mode: input.demo ? "synthetic_demo" : "local_import",
    positions, currencyPositions, weeks, issues,
    counts: {
      accounts: positions.length,
      transactions: positions.reduce((n, x) => n + x.transactions, 0),
      forecasts: validForecasts.length,
      reconciled: positions.filter(x => x.reconciled).length
    },
    sources: [
      {file: "accounts.csv", rows: accounts.length},
      {file: "transactions.csv", rows: transactions.length},
      {file: "forecast.csv", rows: forecasts.length}
    ],
    methodology: [
      "Balances = dated opening bank balances + unique posted movements on or before the report date.",
      "Every provided transaction closing balance is compared to the independently calculated running balance.",
      "Each ISO currency is reported separately. No unsourced FX rates, cross-currency totals or valuations.",
      "The 13-week baseline includes committed and expected cash flows. Downside excludes expected inflows but includes expected outflows.",
      "Missing, conflicting, stale and unreconciled sources are flagged. Results are not bank-certified.",
      "Inputs and calculated reports remain in this browser session; no model, bank or payment service is invoked."
    ]
  };
}

function exportCell(value: string | number): string {
  if (typeof value === "number") return String(value);
  const clean = /^[\s]*[=+\-@\t\r]/.test(value) ? "'" + value : value;
  return '"' + clean.replace(/"/g, '""') + '"';
}
/** Human-readable CSV evidence pack; potentially malicious imported refs are Excel-formula escaped. */
export function treasuryEvidenceCSV(report: TreasuryReport): string {
  const lines: Array<Array<string | number>> = [["section", "key", "currency", "date", "value_minor", "details", "evidence"]];
  lines.push(["report", report.status, "", report.reportDate, 0, report.mode, report.generatedAt]);
  report.positions.forEach(x => lines.push(["account", x.accountId, x.currency, x.lastEvidenceDate,
    x.balanceMinor, x.reconciled ? "reconciled" : "requires review", "accounts.csv:" + x.accountId]));
  report.weeks.forEach(x => lines.push(["forecast", "week " + x.week, x.currency, x.weekEnd,
    x.closingBaseMinor, "downside minor=" + x.closingDownsideMinor, x.sourceRows.join("; ")]));
  report.issues.forEach(x => lines.push(["issue", x.code, "", "", 0, x.message, x.evidence]));
  return lines.map(row => row.map(exportCell).join(",")).join("\r\n") + "\r\n";
}
export function treasuryDemoInput(reportDate: string): TreasuryInputs {
  const asOf = addDays(reportDate, -7), day1 = addDays(reportDate, -6),
    day2 = addDays(reportDate, -4), day3 = addDays(reportDate, -2);
  return {
    demo: true, reportDate,
    accountsCSV: [
      "account_id,currency,as_of,opening_balance",
      "UK-OPERATING,GBP," + asOf + ",250000.00",
      "EU-OPERATING,EUR," + asOf + ",150000.00",
      "US-OPERATING,USD," + asOf + ",120000.00"
    ].join("\n"),
    transactionsCSV: [
      "transaction_id,account_id,currency,date,reference,amount,closing_balance",
      "UK-01,UK-OPERATING,GBP," + day1 + ",Customer receipt,32000.00,282000.00",
      "UK-02,UK-OPERATING,GBP," + day2 + ",Payroll,-58000.00,224000.00",
      "UK-03,UK-OPERATING,GBP," + day3 + ",Supplier invoices,-24000.00,200000.00",
      "EU-01,EU-OPERATING,EUR," + day1 + ",Collection,16000.00,166000.00",
      "EU-02,EU-OPERATING,EUR," + day3 + ",Vendor payment,-8000.00,158000.00",
      "US-01,US-OPERATING,USD," + day2 + ",Invoice receipts,10000.00,130000.00"
    ].join("\n"),
    forecastCSV: [
      "account_id,date,reference,amount,certainty",
      "UK-OPERATING," + addDays(reportDate, 5) + ",Committed salary payments,-65000.00,committed",
      "UK-OPERATING," + addDays(reportDate, 12) + ",Expected sales receipts,90000.00,expected",
      "UK-OPERATING," + addDays(reportDate, 35) + ",Supplier contract,-52000.00,committed",
      "EU-OPERATING," + addDays(reportDate, 8) + ",Supplier order,-48000.00,committed",
      "EU-OPERATING," + addDays(reportDate, 21) + ",Expected invoice,24000.00,expected",
      "US-OPERATING," + addDays(reportDate, 43) + ",Operating expenses,-28000.00,expected"
    ].join("\n")
  };
}
