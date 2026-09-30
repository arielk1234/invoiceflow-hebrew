/**
 * Israel Tax Authority Uniform Format ("מבנה אחיד") exporter, version 1.31.
 *
 * Follows "הוראות להפקת קבצים במבנה אחיד" 1.31 and the record tables published by
 * the Tax Authority's simulator (https://secapp.taxes.gov.il/TmbakmmsmlNew/frmShowTables.aspx).
 * The software issues tax invoices (305), credit notes (330) and receipts (400), so
 * BKMVDATA.TXT holds A100, B110 (an account per customer), C100, D110 (invoice and
 * credit note lines), D120 (receipt payments) and Z900. It keeps no ledger or
 * inventory, so there are no B100/M100 records and account totals are zero.
 */
import type { BusinessInfo, Client, Doc } from "./store";
import { zip } from "./zip";

export const UNIFORM_FORMAT_VERSION = "1.31";
export const CRLF = "\r\n";
const SYSTEM_CONSTANT = "&OF1.31&";
const TIME_ZONE = "Asia/Jerusalem";

/**
 * Record length and the unsigned numeric fields ([start, length], 1-based) of each
 * record written. Numeric fields without a value are zero-filled (section 2.3.ז).
 */
const LAYOUT = {
  A000: {
    length: 466,
    numeric: [
      [10, 15],
      [25, 9],
      [34, 15],
      [57, 8],
      [105, 9],
      [134, 1],
      [185, 1],
      [186, 1],
      [187, 9],
      [196, 9],
      [363, 4],
      [367, 8],
      [375, 8],
      [383, 8],
      [391, 4],
      [395, 1],
      [396, 1],
      [420, 1],
    ],
  },
  A100: {
    length: 95,
    numeric: [
      [5, 9],
      [14, 9],
      [23, 15],
    ],
  },
  B110: {
    length: 376,
    numeric: [
      [5, 9],
      [14, 9],
      [323, 4],
      [327, 9],
    ],
  },
  C100: {
    length: 444,
    numeric: [
      [5, 9],
      [14, 9],
      [23, 3],
      [46, 8],
      [54, 4],
      [253, 9],
      [262, 8],
      [401, 8],
      [425, 7],
    ],
  },
  D110: {
    length: 339,
    numeric: [
      [5, 9],
      [14, 9],
      [23, 3],
      [46, 4],
      [50, 3],
      [73, 1],
      [286, 4],
      [297, 8],
      [305, 7],
    ],
  },
  D120: {
    length: 222,
    numeric: [
      [5, 9],
      [14, 9],
      [23, 3],
      [46, 4],
      [50, 1],
      [51, 10],
      [61, 10],
      [71, 15],
      [86, 10],
      [96, 8],
      [119, 1],
      [140, 1],
      [148, 8],
      [156, 7],
    ],
  },
  Z900: {
    length: 110,
    numeric: [
      [5, 9],
      [14, 9],
      [23, 15],
      [46, 15],
    ],
  },
} as const satisfies Record<
  string,
  { length: number; numeric: ReadonlyArray<readonly [number, number]> }
>;

type RecordCode = keyof typeof LAYOUT;

/** Record descriptions for the printed report (appendix 4). */
export const RECORD_DESCRIPTIONS: Record<string, string> = {
  A100: "רשומת פתיחה",
  B100: "תנועות בהנהלת חשבונות",
  B110: "חשבון בהנהלת חשבונות",
  C100: "כותרת מסמך",
  D110: "פרטי מסמך",
  D120: "פרטי קבלות",
  M100: "פריטים במלאי",
  Z900: "רשומת סיום",
};

/** Document type codes, appendix 1. */
const DOC_TYPE: Record<Doc["type"], number> = { invoice: 305, credit_note: 330, receipt: 400 };

/** Appendix 1, for the report of section 2.6 (types the software does not manage show 0). */
const APPENDIX_1: Array<[number, string]> = [
  [100, "הזמנה"],
  [200, "תעודת משלוח"],
  [205, "תעודת משלוח סוכן"],
  [210, "תעודת החזרה"],
  [300, "חשבונית/חשבונית עסקה"],
  [305, "חשבונית-מס"],
  [310, "חשבונית ריכוז"],
  [320, "חשבונית מס / קבלה"],
  [330, "חשבונית מס זיכוי"],
  [340, "חשבונית שריון"],
  [345, "חשבונית סוכן"],
  [400, "קבלה"],
  [405, "קבלה על תרומות"],
  [410, "יציאה מקופה"],
  [420, "הפקדת בנק"],
  [500, "הזמנת רכש"],
  [600, "תעודת משלוח רכש"],
  [610, "החזרת רכש"],
  [700, "חשבונית מס רכש"],
  [710, "זיכוי רכש"],
  [800, "יתרת פתיחה"],
  [810, "כניסה כללית למלאי"],
  [820, "יציאה כללית מהמלאי"],
  [830, "העברה בין מחסנים"],
  [840, "עדכון בעקבות ספירה"],
  [900, "דוח ייצור-כניסה"],
  [910, "דוח ייצור-יציאה"],
];

export type UniformExportConfig = {
  /** 8 digits; empty until the Tax Authority issues a registration certificate. */
  registrationNumber: string;
  softwareName: string;
  softwareVersion: string;
  manufacturerTaxId: string;
  manufacturerName: string;
  /** 1 = single-year, 2 = multi-year (field 1011). */
  softwareType?: 1 | 2;
  /** 0 = no bookkeeping, 1 = single-entry, 2 = double-entry (field 1013). */
  accountingType?: 0 | 1 | 2;
  accountingBalanceLevel?: 1 | 2;
  companyNumber?: string;
  withholdingFileNumber?: string;
  compressionProgram?: string;
  hasBranches?: boolean;
};

export type UniformExportInput = {
  business: BusinessInfo;
  clients: Client[];
  docs: Doc[];
  config: UniformExportConfig;
  fromDate: string;
  toDate: string;
  generatedAt?: Date;
};

export type UniformExportResult = {
  iniText: string;
  bkmvdataText: string;
  recordCounts: Record<string, number>;
  primaryId: string;
  generatedAt: Date;
  /** Where the files belong, section 2.2: OPENFRMT\<VAT 8 digits>.<YY>\<MMDDhhmm>. */
  folder: string;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/** Text that ISO-8859-8 can hold: ASCII and Hebrew letters; anything else is replaced. */
function encodable(value: string): string {
  let out = "";
  for (const ch of value.replace(/[\r\n\t]+/g, " ")) {
    const cp = ch.codePointAt(0) ?? 0x3f;
    if ((cp >= 0x20 && cp <= 0x7e) || (cp >= 0x05d0 && cp <= 0x05ea)) out += ch;
    else if (cp === 0x05f4 || cp === 0x201c || cp === 0x201d) out += '"';
    else if (cp === 0x05f3 || cp === 0x2018 || cp === 0x2019) out += "'";
    else if (cp === 0x2013 || cp === 0x2014 || cp === 0x05be) out += "-";
    else if (cp === 0xa0) out += " ";
    else if (cp >= 0x0591 && cp <= 0x05c7)
      continue; // niqqud and cantillation marks
    else out += "?";
  }
  return out;
}

/** A blank record: spaces, zeros in the numeric fields, and its record code. */
function record(code: RecordCode): string[] {
  const { length, numeric } = LAYOUT[code];
  const r = Array.from({ length }, () => " ");
  for (const [start, len] of numeric) r.fill("0", start - 1, start - 1 + len);
  r.splice(0, 4, ...code);
  return r;
}

/** Alphanumeric field: left-aligned and space-padded; longer text is cut to the field. */
function text(r: string[], start: number, length: number, value: string | undefined) {
  const v = encodable(value ?? "")
    .trim()
    .slice(0, length)
    .padEnd(length, " ");
  r.splice(start - 1, length, ...v);
}

/** Numeric field: right-aligned with leading zeros. */
function num(r: string[], start: number, length: number, value: number | string) {
  const v = String(value);
  assert(/^\d+$/.test(v) && v.length <= length, `UNIFORM_NUMERIC_FIELD_INVALID_AT_${start}`);
  r.splice(start - 1, length, ...v.padStart(length, "0"));
}

/** Signed amount X9(n)v99 (section 2.3.ו): the sign, then the value without a decimal point. */
function signed(r: string[], start: number, length: number, value: number, decimals = 2) {
  const digits = String(Math.round(Math.abs(value) * 10 ** decimals)).padStart(length - 1, "0");
  assert(digits.length === length - 1, `UNIFORM_AMOUNT_OVERFLOW_AT_${start}`);
  const sign = value < 0 && /[1-9]/.test(digits) ? "-" : "+";
  r.splice(start - 1, length, ...(sign + digits));
}

function line(r: string[]): string {
  return r.join("") + CRLF;
}

/** "YYYYMMDD" and "hhmm" in Israel time. */
function israelDateTime(d: Date): { date: string; time: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  return {
    date: `${parts.year}${parts.month}${parts.day}`,
    time: `${parts.hour}${parts.minute}`,
  };
}

function date8(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  assert(m, "UNIFORM_DATE_INVALID");
  return m[1] + m[2] + m[3];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The document number, written the same way in every record (section 2.4.ד). */
function docNumber(value: string): string {
  const v = value.trim();
  assert(v && v.length <= 20, "UNIFORM_DOCUMENT_NUMBER_INVALID");
  return v;
}

/** Customer key (field 1225): stable per customer, at most 15 characters (the random end of its id). */
function customerKey(client: Client): string {
  return client.id.replace(/-/g, "").slice(-15).toUpperCase();
}

/** Amounts as issued: the totals stored by the server when present. */
function amounts(doc: Doc) {
  const subtotal =
    doc.subtotal ?? round2(doc.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0));
  const vat = doc.vatAmount ?? round2((subtotal * doc.vatRate) / 100);
  const total = doc.totalAmount ?? round2(subtotal + vat);
  return { subtotal, vat, total };
}

/** Payment method code (field 1306) from the receipt's free-text payment method. */
function paymentMethodCode(method: string | undefined): number {
  const m = (method ?? "").toLowerCase();
  if (/מזומן|cash/.test(m)) return 1;
  if (/המחאה|צ'ק|צ׳ק|שיק|cheque|check/.test(m)) return 2;
  if (/אשראי|credit|visa|ויזה/.test(m)) return 3;
  if (/הוראת קבע|standing/.test(m)) return 8;
  if (/העברה|bank|transfer/.test(m)) return 4;
  return 9;
}

function primaryId(): string {
  const bytes = new Uint8Array(15);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => String(b % 10)).join("");
}

type Context = { taxId: string; clients: Map<string, Client>; docsById: Map<string, Doc> };

function openingRecord(taxId: string, id: string): string {
  const r = record("A100");
  num(r, 5, 9, 1);
  num(r, 14, 9, taxId);
  num(r, 23, 15, id);
  text(r, 38, 8, SYSTEM_CONSTANT);
  return line(r);
}

function closingRecord(taxId: string, id: string, recordNo: number): string {
  const r = record("Z900");
  num(r, 5, 9, recordNo);
  num(r, 14, 9, taxId);
  num(r, 23, 15, id);
  text(r, 38, 8, SYSTEM_CONSTANT);
  num(r, 46, 15, recordNo);
  return line(r);
}

/**
 * The customer's account (B110), keyed like field 1225 of its documents. With no
 * ledger (field 1013 = 0) there are no B100 entries, so its totals are zero.
 */
function accountRecord(ctx: Context, client: Client, recordNo: number): string {
  const r = record("B110");
  num(r, 5, 9, recordNo);
  num(r, 14, 9, ctx.taxId);
  text(r, 23, 15, customerKey(client));
  text(r, 38, 50, client.name);
  text(r, 88, 15, "CUSTOMERS");
  text(r, 103, 30, "לקוחות");
  text(r, 133, 50, client.address);
  text(r, 261, 2, "IL");
  signed(r, 278, 15, 0);
  signed(r, 293, 15, 0);
  signed(r, 308, 15, 0);
  if (/^\d{9}$/.test(client.taxId ?? "")) num(r, 327, 9, client.taxId!);
  return line(r);
}

function headerRecord(ctx: Context, doc: Doc, recordNo: number, link: number): string {
  const client = ctx.clients.get(doc.clientId);
  assert(client, "UNIFORM_CLIENT_NOT_FOUND");
  const t = amounts(doc);
  // 1205/1206: when the system issued the document, which the user cannot change.
  const issued = doc.issuedAt
    ? israelDateTime(new Date(doc.issuedAt))
    : { date: date8(doc.issueDate), time: "0000" };
  const r = record("C100");
  num(r, 5, 9, recordNo);
  num(r, 14, 9, ctx.taxId);
  num(r, 23, 3, DOC_TYPE[doc.type]);
  text(r, 26, 20, docNumber(doc.number));
  num(r, 46, 8, issued.date);
  num(r, 54, 4, issued.time);
  text(r, 58, 50, client.name);
  text(r, 108, 50, client.address);
  text(r, 236, 2, "IL");
  text(r, 238, 15, client.phone);
  if (/^\d{9}$/.test(client.taxId ?? "")) num(r, 253, 9, client.taxId!);
  num(r, 262, 8, date8(doc.issueDate));
  if (doc.type === "receipt") {
    // A receipt records the amount received (1223, without withholding tax).
    signed(r, 348, 15, t.total);
  } else {
    signed(r, 288, 15, t.subtotal);
    signed(r, 303, 15, 0);
    signed(r, 318, 15, t.subtotal);
    signed(r, 333, 15, t.vat);
    signed(r, 348, 15, t.total);
  }
  text(r, 375, 15, customerKey(client));
  if (doc.status === "cancelled") text(r, 400, 1, "1");
  num(r, 401, 8, date8(doc.issueDate));
  num(r, 425, 7, link);
  return line(r);
}

function lineRecord(
  ctx: Context,
  doc: Doc,
  item: Doc["items"][number],
  row: number,
  recordNo: number,
  link: number,
): string {
  // A credit note is based on the invoice it credits (clarification 6).
  const base =
    doc.type === "credit_note" && doc.relatedDocumentId
      ? ctx.docsById.get(doc.relatedDocumentId)
      : undefined;
  const r = record("D110");
  num(r, 5, 9, recordNo);
  num(r, 14, 9, ctx.taxId);
  num(r, 23, 3, DOC_TYPE[doc.type]);
  text(r, 26, 20, docNumber(doc.number));
  num(r, 46, 4, row);
  if (base?.number) {
    num(r, 50, 3, DOC_TYPE[base.type]);
    text(r, 53, 20, docNumber(base.number));
  }
  text(r, 94, 30, item.description.trim() || "פריט");
  text(r, 204, 20, item.unit?.trim() || "יחידה");
  signed(r, 224, 17, item.quantity, 4);
  signed(r, 241, 15, item.unitPrice);
  signed(r, 256, 15, 0);
  signed(r, 271, 15, round2(item.quantity * item.unitPrice));
  num(r, 286, 4, Math.round(doc.vatRate * 100));
  num(r, 297, 8, date8(doc.issueDate));
  num(r, 305, 7, link);
  return line(r);
}

function paymentRecord(ctx: Context, doc: Doc, recordNo: number, link: number): string {
  const method = paymentMethodCode(doc.paymentMethod);
  const r = record("D120");
  num(r, 5, 9, recordNo);
  num(r, 14, 9, ctx.taxId);
  num(r, 23, 3, DOC_TYPE[doc.type]);
  text(r, 26, 20, docNumber(doc.number));
  num(r, 46, 4, 1);
  num(r, 50, 1, method);
  if (method === 2) {
    // Cheque: bank, branch, account and cheque number (fields 1307-1310).
    const digits = (v: string | undefined) => (v ?? "").replace(/\D/g, "") || "0";
    num(r, 51, 10, digits(doc.chequeBank));
    num(r, 61, 10, digits(doc.chequeBranch));
    num(r, 71, 15, digits(doc.chequeAccount));
    num(r, 86, 10, digits(doc.chequeNumber));
  }
  // Due date only for a cheque or a credit card (field 1311).
  if (method === 2 || method === 3) num(r, 96, 8, date8(doc.dueDate || doc.issueDate));
  signed(r, 104, 15, amounts(doc).total);
  num(r, 148, 8, date8(doc.issueDate));
  num(r, 156, 7, link);
  return line(r);
}

function summaryRecord(code: string, count: number): string {
  return code + String(count).padStart(15, "0") + CRLF;
}

function iniRecord(
  input: UniformExportInput,
  totalRecords: number,
  id: string,
  folder: string,
  started: { date: string; time: string },
): string {
  const { business, config } = input;
  const softwareType = config.softwareType ?? 2;
  const r = record("A000");
  num(r, 10, 15, totalRecords);
  num(r, 25, 9, business.taxId);
  num(r, 34, 15, id);
  text(r, 49, 8, SYSTEM_CONSTANT);
  num(r, 57, 8, config.registrationNumber || "0");
  text(r, 65, 20, config.softwareName);
  text(r, 85, 20, config.softwareVersion);
  num(r, 105, 9, config.manufacturerTaxId);
  text(r, 114, 20, config.manufacturerName);
  num(r, 134, 1, softwareType);
  text(r, 135, 50, folder);
  num(r, 185, 1, config.accountingType ?? 0);
  if (config.accountingBalanceLevel) num(r, 186, 1, config.accountingBalanceLevel);
  if (config.companyNumber) num(r, 187, 9, config.companyNumber);
  if (config.withholdingFileNumber) num(r, 196, 9, config.withholdingFileNumber);
  text(r, 215, 50, business.name);
  text(r, 265, 50, business.address);
  if (softwareType === 1) num(r, 363, 4, input.fromDate.slice(0, 4));
  else {
    num(r, 367, 8, date8(input.fromDate));
    num(r, 375, 8, date8(input.toDate));
  }
  num(r, 383, 8, started.date);
  num(r, 391, 4, started.time);
  num(r, 395, 1, 0); // Hebrew
  num(r, 396, 1, 1); // ISO-8859-8-i
  text(r, 397, 20, config.compressionProgram || "ZIP");
  text(r, 417, 3, "ILS");
  num(r, 420, 1, config.hasBranches ? 1 : 0);
  return line(r);
}

export function validateUniformExportConfig(c: UniformExportConfig): string[] {
  const errors: string[] = [];
  if (c.registrationNumber && !/^\d{8}$/.test(c.registrationNumber))
    errors.push("INVALID_SOFTWARE_REGISTRATION_NUMBER");
  if (!c.softwareName.trim() || c.softwareName.length > 20) errors.push("INVALID_SOFTWARE_NAME");
  if (!c.softwareVersion.trim() || c.softwareVersion.length > 20)
    errors.push("INVALID_SOFTWARE_VERSION");
  if (!/^\d{9}$/.test(c.manufacturerTaxId)) errors.push("INVALID_MANUFACTURER_TAX_ID");
  if (!c.manufacturerName.trim() || c.manufacturerName.length > 20)
    errors.push("INVALID_MANUFACTURER_NAME");
  return errors;
}

/** Issued documents in the range, by date (drafts are not accounting documents). */
function documentsInRange(input: UniformExportInput): Doc[] {
  return input.docs
    .filter(
      (d) => d.issueDate >= input.fromDate && d.issueDate <= input.toDate && d.status !== "draft",
    )
    .sort((a, b) => a.issueDate.localeCompare(b.issueDate) || a.number.localeCompare(b.number));
}

export function exportUniformFormat(input: UniformExportInput): UniformExportResult {
  const taxId = input.business.taxId;
  assert(/^\d{9}$/.test(taxId), "BUSINESS_TAX_ID_MUST_BE_9_DIGITS");
  const configErrors = validateUniformExportConfig(input.config);
  assert(configErrors.length === 0, configErrors.join(","));
  assert(input.fromDate <= input.toDate, "INVALID_DATE_RANGE");

  const generatedAt = input.generatedAt ?? new Date();
  const started = israelDateTime(generatedAt);
  // The simulator rejects dates after the day the files are produced.
  assert(date8(input.toDate) <= started.date, "DATE_RANGE_IN_FUTURE");
  const folder = `OPENFRMT\\${taxId.slice(0, 8)}.${started.date.slice(2, 4)}\\${started.date.slice(4, 8)}${started.time}`;
  const id = primaryId();
  const ctx: Context = {
    taxId,
    clients: new Map(input.clients.map((c) => [c.id, c])),
    docsById: new Map(input.docs.map((d) => [d.id, d])),
  };

  const data: string[] = [openingRecord(taxId, id)];
  const counts: Record<string, number> = { A100: 1 };
  const add = (code: RecordCode, rec: string) => {
    data.push(rec);
    counts[code] = (counts[code] ?? 0) + 1;
  };

  const docs = documentsInRange(input);
  // The accounts index first: one B110 per customer the documents refer to.
  const accounts = new Set(docs.map((d) => d.clientId));
  for (const client of input.clients) {
    if (accounts.has(client.id)) add("B110", accountRecord(ctx, client, data.length + 1));
  }

  let link = 0;
  for (const doc of docs) {
    link++;
    add("C100", headerRecord(ctx, doc, data.length + 1, link));
    if (doc.type === "receipt") {
      add("D120", paymentRecord(ctx, doc, data.length + 1, link));
    } else {
      doc.items.forEach((item, i) =>
        add("D110", lineRecord(ctx, doc, item, i + 1, data.length + 1, link)),
      );
    }
  }
  add("Z900", closingRecord(taxId, id, data.length + 1));

  // INI.TXT: the A000 record, then a summary for each record type in BKMVDATA.TXT (2.5.ב).
  const iniText =
    iniRecord(input, data.length, id, folder, started) +
    (["B100", "B110", "C100", "D110", "D120", "M100"] as const)
      .filter((code) => counts[code])
      .map((code) => summaryRecord(code, counts[code]!))
      .join("");

  return {
    iniText,
    bkmvdataText: data.join(""),
    recordCounts: counts,
    primaryId: id,
    generatedAt,
    folder,
  };
}

export type SimulatorFixtureResult = UniformExportResult & {
  simulatorRecords: number;
  simulatorBytes: number;
  documentTypesCovered: number[];
};

/** A 9-digit number with a valid Israeli check digit, for test customers. */
function testTaxId(n: number): string {
  const base = String(30000000 + n * 7919).slice(-8);
  for (let d = 0; d <= 9; d++) {
    const v = base + d;
    const sum = [...v].reduce((acc, ch, i) => {
      const x = Number(ch) * (i % 2 === 0 ? 1 : 2);
      return acc + (x > 9 ? x - 9 : x);
    }, 0);
    if (sum % 10 === 0) return v;
  }
  throw new Error("UNIFORM_TEST_TAX_ID");
}

/**
 * The simulator needs a file of at least 2,000 records. Test documents of every
 * type the software issues run through the same exporter as real data.
 */
export function buildSimulatorFixture(input: UniformExportInput): SimulatorFixtureResult {
  // Test documents are dated no later than today, as real documents are.
  const now = input.generatedAt ?? new Date();
  const today = israelDateTime(now).date;
  const todayIso = `${today.slice(0, 4)}-${today.slice(4, 6)}-${today.slice(6, 8)}`;
  const toDate = input.toDate > todayIso ? todayIso : input.toDate;
  const from = new Date(`${input.fromDate}T00:00:00Z`).getTime();
  const to = new Date(`${toDate}T00:00:00Z`).getTime();
  assert(from <= to, "INVALID_DATE_RANGE");
  const dayOf = (i: number, n: number) =>
    new Date(from + Math.floor(((to - from) * i) / Math.max(n - 1, 1))).toISOString().slice(0, 10);

  const clients: Client[] = Array.from({ length: 25 }, (_, i) => ({
    id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    name: `לקוח לבדיקה ${i + 1} בע"מ`,
    taxId: testTaxId(i + 1),
    address: `רחוב הבדיקה ${i + 1}, תל אביב`,
    phone: "03-5555555",
    isVatRegistered: true,
  }));
  const year = input.fromDate.slice(0, 4);
  const docs: Doc[] = [];
  const make = (type: Doc["type"], i: number, n: number, extra: Partial<Doc>): Doc => {
    const date = dayOf(i, n);
    const code = type === "invoice" ? "INV" : type === "receipt" ? "REC" : "CN";
    return {
      id: `${code}-${i}`,
      type,
      number: `${code}-${year}-${String(i + 1).padStart(6, "0")}`,
      clientId: clients[i % clients.length]!.id,
      issueDate: date,
      dueDate: date,
      issuedAt: new Date(
        Math.min(Date.parse(`${date}T09:30:00+03:00`), now.getTime()),
      ).toISOString(),
      items: [],
      vatRate: input.business.vatRate || 18,
      status: "issued",
      allocationRequested: false,
      ...extra,
    };
  };
  const INVOICES = 520;
  for (let i = 0; i < INVOICES; i++) {
    docs.push(
      make("invoice", i, INVOICES, {
        status: i % 40 === 39 ? "cancelled" : "issued",
        items: [
          {
            id: `i${i}a`,
            description: "שירותי ייעוץ",
            unit: "יחידה",
            quantity: 1 + (i % 4),
            unitPrice: 850,
          },
          { id: `i${i}b`, description: "שעות עבודה", unit: "שעה", quantity: 2.5, unitPrice: 320 },
        ],
      }),
    );
  }
  const methods = ["מזומן", "העברה בנקאית", "כרטיס אשראי", "המחאה"];
  for (let i = 0; i < 200; i++) {
    const method = methods[i % methods.length]!;
    docs.push(
      make("receipt", i, 200, {
        paymentMethod: method,
        ...(method === "המחאה"
          ? {
              chequeBank: "12",
              chequeBranch: "345",
              chequeAccount: "123456",
              chequeNumber: String(1000 + i),
            }
          : {}),
        items: [
          { id: `r${i}`, description: "תשלום", unit: "יחידה", quantity: 1, unitPrice: 1500 + i },
        ],
      }),
    );
  }
  for (let i = 0; i < 60; i++) {
    docs.push(
      make("credit_note", i, 60, {
        relatedDocumentId: `INV-${i}`,
        creditReason: "תיקון מחיר",
        items: [
          {
            id: `c${i}`,
            description: "זיכוי על שירות",
            unit: "יחידה",
            quantity: 1,
            unitPrice: 200,
          },
        ],
      }),
    );
  }

  const result = exportUniformFormat({ ...input, toDate, generatedAt: now, clients, docs });
  const records = result.bkmvdataText.split(CRLF).filter(Boolean).length;
  const bytes = toUniformDownloadBytes(result.bkmvdataText).byteLength;
  const errors = [
    ...validateUniformExportText(result),
    ...validateSimulatorPayload(bytes, records),
  ];
  assert(errors.length === 0, errors.join(","));
  return {
    ...result,
    simulatorRecords: records,
    simulatorBytes: bytes,
    documentTypesCovered: [DOC_TYPE.invoice, DOC_TYPE.credit_note, DOC_TYPE.receipt],
  };
}

export type UniformPrintReportRow = {
  code: number;
  description: string;
  count: number;
  total: number;
};

/** Data for the printed outputs: appendix 4 (after producing the files) and section 2.6. */
export function buildUniformPrintReport(input: UniformExportInput, result: UniformExportResult) {
  const rows = new Map<number, UniformPrintReportRow>(
    APPENDIX_1.map(([code, description]) => [code, { code, description, count: 0, total: 0 }]),
  );
  for (const doc of documentsInRange(input)) {
    const row = rows.get(DOC_TYPE[doc.type])!;
    row.count += 1;
    row.total = round2(row.total + amounts(doc).total);
  }
  const records = ["A100", "B100", "B110", "C100", "D110", "D120", "M100", "Z900"]
    .filter((code) => result.recordCounts[code])
    .map((code) => ({
      code,
      description: RECORD_DESCRIPTIONS[code]!,
      count: result.recordCounts[code]!,
    }));
  const started = israelDateTime(result.generatedAt);
  return {
    businessTaxId: input.business.taxId,
    businessName: input.business.name,
    fromDate: input.fromDate,
    toDate: input.toDate,
    folder: result.folder,
    primaryId: result.primaryId,
    records,
    documents: [...rows.values()],
    softwareName: input.config.softwareName,
    softwareVersion: input.config.softwareVersion,
    registrationNumber: input.config.registrationNumber,
    producedDate: `${started.date.slice(6, 8)}/${started.date.slice(4, 6)}/${started.date.slice(2, 4)}`,
    producedTime: `${started.time.slice(0, 2)}:${started.time.slice(2, 4)}`,
  };
}

/** Structural checks against the record layouts, before the files are offered. */
export function validateUniformExportText(result: UniformExportResult): string[] {
  const errors: string[] = [];
  const iniLines = result.iniText.split(CRLF).filter(Boolean);
  const dataLines = result.bkmvdataText.split(CRLF).filter(Boolean);

  const checkRecord = (l: string, where: string) => {
    const code = l.slice(0, 4) as RecordCode;
    const layout = LAYOUT[code];
    if (!layout) {
      errors.push(`UNKNOWN_RECORD_${code}_${where}`);
      return;
    }
    if (iso88598(l).length !== layout.length) errors.push(`RECORD_LENGTH_${code}_${where}`);
    for (const [start, len] of layout.numeric) {
      if (!/^\d+$/.test(l.slice(start - 1, start - 1 + len)))
        errors.push(`NUMERIC_FIELD_${code}_${start}_${where}`);
    }
  };

  if (iniLines[0]?.slice(0, 4) !== "A000") errors.push("INI_MISSING_A000");
  else checkRecord(iniLines[0], "INI");
  for (const l of iniLines.slice(1)) {
    if (!/^[A-Z]\d{3}\d{15}$/.test(l)) errors.push(`INI_SUMMARY_INVALID_${l.slice(0, 4)}`);
  }
  if (dataLines[0]?.slice(0, 4) !== "A100") errors.push("DATA_MISSING_A100");
  if (dataLines.at(-1)?.slice(0, 4) !== "Z900") errors.push("DATA_MISSING_Z900");

  const counts: Record<string, number> = {};
  dataLines.forEach((l, i) => {
    checkRecord(l, String(i + 1));
    if (l.slice(4, 13) !== String(i + 1).padStart(9, "0")) errors.push(`RECORD_SEQUENCE_${i + 1}`);
    counts[l.slice(0, 4)] = (counts[l.slice(0, 4)] ?? 0) + 1;
  });

  const total = String(dataLines.length).padStart(15, "0");
  if (dataLines.at(-1)?.slice(45, 60) !== total) errors.push("TOTAL_RECORD_COUNT_MISMATCH_Z900");
  if (iniLines[0]?.slice(9, 24) !== total) errors.push("TOTAL_RECORD_COUNT_MISMATCH_A000");

  const summaries = Object.fromEntries(
    iniLines.slice(1).map((l) => [l.slice(0, 4), Number(l.slice(4))]),
  );
  for (const [code, count] of Object.entries(counts)) {
    if (code !== "A100" && code !== "Z900" && summaries[code] !== count)
      errors.push(`INI_SUMMARY_${code}`);
  }
  for (const code of Object.keys(summaries))
    if (!counts[code]) errors.push(`INI_SUMMARY_EXTRA_${code}`);
  return errors;
}

export function validateSimulatorPayload(bytes: number, records: number): string[] {
  const errors: string[] = [];
  if (records < 2000) errors.push("MINIMUM_2000_RECORDS");
  if (bytes > 4 * 1024 * 1024) errors.push("MAXIMUM_4MB");
  return errors;
}

/** ISO-8859-8 bytes: every character the exporter writes maps to exactly one byte. */
function iso88598(value: string): Uint8Array {
  const out: number[] = [];
  for (const ch of value) {
    const cp = ch.codePointAt(0) ?? 0x3f;
    if (cp >= 0x05d0 && cp <= 0x05ea) out.push(0xe0 + cp - 0x05d0);
    else if (cp <= 0x7f) out.push(cp);
    else out.push(0x3f);
  }
  return Uint8Array.from(out);
}

export function toUniformDownloadBytes(text: string): Uint8Array {
  return iso88598(text);
}

/**
 * The files as section 2.2 lays them out: OPENFRMT\<VAT>.<YY>\<MMDDhhmm>\ holding
 * INI.TXT and BKMVDATA.TXT compressed into BKMVDATA.zip, packed in one ZIP to download.
 */
export function openFormatArchive(result: UniformExportResult): Uint8Array {
  const folder = result.folder.replace(/\\/g, "/");
  const bkmvdata = zip([
    { name: "BKMVDATA.TXT", data: toUniformDownloadBytes(result.bkmvdataText) },
  ]);
  return zip([
    { name: `${folder}/INI.TXT`, data: toUniformDownloadBytes(result.iniText) },
    { name: `${folder}/BKMVDATA.zip`, data: bkmvdata },
  ]);
}
