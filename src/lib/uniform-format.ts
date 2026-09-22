/**
 * Israel Tax Authority Uniform Format 1.31 exporter.
 * Based on the supplied Tax Authority instructions, version 1.31.
 */
import type { BusinessInfo, Client, Doc, LineItem } from "./store";

export const UNIFORM_FORMAT_VERSION = "1.31";
export const CRLF = "\r\n";

export const UNIFORM_RECORDS = {
  A000: { file: "INI.TXT", code: "000A", length: 466 },
  B100_SUMMARY: { file: "INI.TXT", code: "100B", length: 19 },
  B110_SUMMARY: { file: "INI.TXT", code: "110B", length: 19 },
  C100_SUMMARY: { file: "INI.TXT", code: "100C", length: 19 },
  D110_SUMMARY: { file: "INI.TXT", code: "110D", length: 19 },
  D120_SUMMARY: { file: "INI.TXT", code: "120D", length: 19 },
  M100_SUMMARY: { file: "INI.TXT", code: "100M", length: 19 },
  A100: { file: "BKMVDATA.TXT", code: "100A", length: 95 },
  B100: { file: "BKMVDATA.TXT", code: "100B", length: 317 },
  B110: { file: "BKMVDATA.TXT", code: "110B", length: 376 },
  C100: { file: "BKMVDATA.TXT", code: "100C", length: 444 },
  D110: { file: "BKMVDATA.TXT", code: "110D", length: 339 },
  D120: { file: "BKMVDATA.TXT", code: "120D", length: 222 },
  M100: { file: "BKMVDATA.TXT", code: "100M", length: 298 },
  Z900: { file: "BKMVDATA.TXT", code: "900Z", length: 110 },
} as const;

export type UniformExportConfig = {
  registrationNumber: string;
  softwareName: string;
  softwareVersion: string;
  manufacturerTaxId: string;
  manufacturerName: string;
  softwareType?: 1 | 2;
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
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function blank(length: number): string[] {
  return Array.from({ length }, () => " ");
}

function field(r: string[], start: number, length: number, value: string, numeric = false) {
  if (length === 0) return;
  const v = String(value || "");
  assert(v.length <= length, "UNIFORM_FIELD_OVERFLOW");
  if (numeric) {
    assert(/^\d*$/.test(v), "UNIFORM_NUMERIC_FIELD_INVALID");
    r.splice(start - 1, length, ...v.padStart(length, "0").split(""));
  } else {
    r.splice(start - 1, length, ...v.padEnd(length, " ").split(""));
  }
}

function line(r: string[]): string {
  return r.join("") + CRLF;
}

function iso88598(value: string): Uint8Array {
  const out: number[] = [];
  for (const ch of value) {
    const cp = ch.codePointAt(0) || 63;
    if (cp >= 0x05d0 && cp <= 0x05ea) out.push(0xe0 + cp - 0x05d0);
    else if (cp <= 0x7f) out.push(cp);
    else out.push(0x3f);
  }
  return Uint8Array.from(out);
}

function date8(value: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  assert(!!m, "UNIFORM_DATE_INVALID");
  return m[1] + m[2] + m[3];
}

function time4(d: Date): string {
  return String(d.getHours()).padStart(2, "0") + String(d.getMinutes()).padStart(2, "0");
}

function n(value: number | string, width: number): string {
  const s = String(value).replace(/\D/g, "");
  assert(s.length <= width, "UNIFORM_NUMERIC_OVERFLOW");
  return s.padStart(width, "0");
}

function amount(value: number, integerDigits = 12, decimals = 2): string {
  const negative = value < 0 ? "-" : "+";
  const raw = String(Math.round(Math.abs(value) * Math.pow(10, decimals)))
    .padStart(integerDigits + decimals, "0");
  assert(raw.length <= integerDigits + decimals, "UNIFORM_AMOUNT_OVERFLOW");
  return negative + raw;
}

function qty(value: number): string {
  const sign = value < 0 ? "-" : "+";
  const raw = String(Math.round(Math.abs(value) * 10000)).padStart(16, "0");
  assert(raw.length === 16, "UNIFORM_QUANTITY_OVERFLOW");
  return sign + raw;
}

function docType(doc: Doc): number {
  if (doc.type === "invoice") return 305;
  if (doc.type === "credit_note") return 330;
  return 400;
}

function docNumber(value: string): string {
  const v = value.trim();
  assert(v.length <= 20, "UNIFORM_DOCUMENT_NUMBER_TOO_LONG");
  return v.padStart(20, "0");
}

function totals(doc: Pick<Doc, "items" | "vatRate">) {
  const subtotal = doc.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const vat = subtotal * doc.vatRate / 100;
  return { subtotal, vat, total: subtotal + vat };
}

function primaryId(): string {
  const bytes = new Uint8Array(15);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => String(b % 10)).join("");
}

function summary(code: string, count: number): string {
  const r = blank(19);
  field(r, 1, 4, code);
  field(r, 5, 15, n(count, 15), true);
  return line(r);
}

function opening(taxId: string, id: string): string {
  const r = blank(95);
  field(r, 1, 4, "100A");
  field(r, 5, 9, "1", true);
  field(r, 14, 9, taxId, true);
  field(r, 23, 15, id, true);
  field(r, 38, 8, "&1.31OF&");
  return line(r);
}

function closing(taxId: string, id: string, total: number): string {
  const r = blank(110);
  field(r, 1, 4, "900Z");
  field(r, 5, 9, n(total, 9), true);
  field(r, 14, 9, taxId, true);
  field(r, 23, 15, id, true);
  field(r, 38, 8, "&1.31OF&");
  field(r, 46, 15, n(total, 15), true);
  return line(r);
}

function ini(
  business: BusinessInfo,
  config: UniformExportConfig,
  totalRecords: number,
  id: string,
  fromDate: string,
  toDate: string,
  generatedAt: Date,
): string {
  const r = blank(466);
  field(r, 1, 4, "000A");
  field(r, 10, 15, n(totalRecords, 15), true);
  field(r, 25, 9, business.taxId, true);
  field(r, 34, 15, id, true);
  field(r, 49, 8, "&1.31OF&");
  field(r, 57, 8, config.registrationNumber, true);
  field(r, 65, 20, config.softwareName);
  field(r, 85, 20, config.softwareVersion);
  field(r, 105, 9, config.manufacturerTaxId, true);
  field(r, 114, 20, config.manufacturerName);
  field(r, 134, 1, String(config.softwareType || 2), true);
  field(r, 185, 1, String(config.accountingType || 0), true);
  if (config.accountingBalanceLevel) field(r, 186, 1, String(config.accountingBalanceLevel), true);
  if (config.companyNumber) field(r, 187, 9, n(config.companyNumber, 9), true);
  if (config.withholdingFileNumber) field(r, 196, 9, n(config.withholdingFileNumber, 9), true);
  const stamp = String(generatedAt.getMonth() + 1).padStart(2, "0") + String(generatedAt.getDate()).padStart(2, "0") + time4(generatedAt);
  const folder = business.taxId.slice(0, 8) + "." + String(generatedAt.getFullYear()).slice(-2);
  field(r, 135, 50, "OPENFRMT\\" + folder + "\\" + stamp);
  field(r, 215, 50, business.name);
  field(r, 265, 50, business.address);
  if ((config.softwareType || 2) === 1) field(r, 363, 4, fromDate.slice(0, 4), true);
  else {
    field(r, 367, 8, date8(fromDate), true);
    field(r, 375, 8, date8(toDate), true);
  }
  field(r, 383, 8, date8(generatedAt.toISOString().slice(0, 10)), true);
  field(r, 391, 4, time4(generatedAt), true);
  field(r, 395, 1, "0", true);
  field(r, 396, 1, "1", true);
  field(r, 397, 20, config.compressionProgram || "ZIP");
  field(r, 417, 3, "ILS");
  field(r, 420, 1, config.hasBranches ? "1" : "0", true);
  return line(r);
}

function header(
  business: BusinessInfo,
  client: Client | undefined,
  doc: Doc,
  recordNo: number,
  generatedAt: Date,
  linkId: number,
): string {
  const r = blank(444);
  const t = totals(doc);
  field(r, 1, 4, "100C");
  field(r, 5, 9, n(recordNo, 9), true);
  field(r, 14, 9, business.taxId, true);
  field(r, 23, 3, n(docType(doc), 3), true);
  field(r, 26, 20, docNumber(doc.number));
  field(r, 46, 8, date8(generatedAt.toISOString().slice(0, 10)), true);
  field(r, 54, 4, time4(generatedAt), true);
  if (client) {
    field(r, 58, 50, client.name);
    field(r, 108, 50, client.address || "");
    field(r, 206, 30, "");
    field(r, 236, 2, "IL");
    field(r, 238, 15, client.phone || "");
    if (client.taxId) field(r, 253, 9, n(client.taxId, 9), true);
  }
  field(r, 262, 8, date8(doc.issueDate), true);
  field(r, 288, 15, amount(t.subtotal));
  field(r, 303, 15, amount(0));
  field(r, 318, 15, amount(t.subtotal));
  field(r, 333, 15, amount(t.vat));
  field(r, 348, 15, amount(t.total));
  field(r, 363, 12, amount(0, 9, 2));
  field(r, 375, 15, doc.clientId);
  field(r, 401, 8, date8(doc.issueDate), true);
  field(r, 425, 7, n(linkId, 7), true);
  return line(r);
}

function detail(
  business: BusinessInfo,
  doc: Doc,
  item: LineItem,
  recordNo: number,
  rowNo: number,
  linkId: number,
): string {
  const r = blank(339);
  const total = item.quantity * item.unitPrice;
  field(r, 1, 4, "110D");
  field(r, 5, 9, n(recordNo, 9), true);
  field(r, 14, 9, business.taxId, true);
  field(r, 23, 3, n(docType(doc), 3), true);
  field(r, 26, 20, docNumber(doc.number));
  field(r, 46, 4, n(rowNo, 4), true);
  field(r, 73, 1, "1", true);
  field(r, 74, 20, item.id);
  field(r, 94, 30, item.description);
  field(r, 204, 20, "יחידה");
  field(r, 224, 17, qty(item.quantity));
  field(r, 241, 15, amount(item.unitPrice));
  field(r, 256, 15, amount(0));
  field(r, 271, 15, amount(total));
  field(r, 286, 4, n(Math.round(doc.vatRate * 100), 4), true);
  field(r, 297, 8, date8(doc.issueDate), true);
  field(r, 305, 7, n(linkId, 7), true);
  return line(r);
}

function receiptDetail(
  business: BusinessInfo,
  doc: Doc,
  recordNo: number,
  linkId: number,
): string {
  const r = blank(222);
  const method: Record<string, string> = { cash: "1", check: "2", credit: "3", bank: "4" };
  field(r, 1, 4, "120D");
  field(r, 5, 9, n(recordNo, 9), true);
  field(r, 14, 9, business.taxId, true);
  field(r, 23, 3, n(docType(doc), 3), true);
  field(r, 26, 20, docNumber(doc.number));
  field(r, 46, 4, "1", true);
  field(r, 50, 1, method[doc.paymentMethod || ""] || "9", true);
  field(r, 96, 8, date8(doc.issueDate), true);
  field(r, 104, 15, amount(totals(doc).total));
  field(r, 148, 8, date8(doc.issueDate), true);
  field(r, 156, 7, n(linkId, 7), true);
  return line(r);
}

export function validateUniformExportConfig(c: UniformExportConfig): string[] {
  const errors: string[] = [];
  if (!/^\d{8}$/.test(c.registrationNumber)) errors.push("INVALID_SOFTWARE_REGISTRATION_NUMBER");
  if (!c.softwareName || c.softwareName.length > 20) errors.push("INVALID_SOFTWARE_NAME");
  if (!c.softwareVersion || c.softwareVersion.length > 20) errors.push("INVALID_SOFTWARE_VERSION");
  if (!/^\d{9}$/.test(c.manufacturerTaxId)) errors.push("INVALID_MANUFACTURER_TAX_ID");
  if (!c.manufacturerName || c.manufacturerName.length > 20) errors.push("INVALID_MANUFACTURER_NAME");
  return errors;
}

export function exportUniformFormat(input: UniformExportInput): UniformExportResult {
  assert(/^\d{9}$/.test(input.business.taxId), "BUSINESS_TAX_ID_MUST_BE_9_DIGITS");
  const configErrors = validateUniformExportConfig(input.config);
  assert(configErrors.length === 0, configErrors.join(","));
  assert(input.fromDate <= input.toDate, "INVALID_DATE_RANGE");

  const generatedAt = input.generatedAt || new Date();
  const docs = input.docs.filter(d =>
    d.issueDate >= input.fromDate &&
    d.issueDate <= input.toDate &&
    d.status !== "draft"
  );
  const id = primaryId();
  const data: string[] = [];
  let seq = 1;
  let cCount = 0;
  let dCount = 0;
  let d120Count = 0;

  data.push(opening(input.business.taxId, id));
  for (const doc of docs) {
    const client = input.clients.find(c => c.id === doc.clientId);
    const linkId = seq;
    cCount++;
    data.push(header(input.business, client, doc, ++seq, generatedAt, linkId));
    for (let i = 0; i < doc.items.length; i++) {
      dCount++;
      data.push(detail(input.business, doc, doc.items[i], ++seq, i + 1, linkId));
    }
    if (doc.type === "receipt") {
      d120Count++;
      data.push(receiptDetail(input.business, doc, ++seq, linkId));
    }
  }
  const total = data.length + 1;
  data.push(closing(input.business.taxId, id, total));

  const iniText = [
    ini(input.business, input.config, total, id, input.fromDate, input.toDate, generatedAt),
    summary("100B", 0),
    summary("110B", 0),
    summary("100C", cCount),
    summary("110D", dCount),
    summary("120D", d120Count),
    summary("100M", 0),
  ].join("");

  return {
    iniText,
    bkmvdataText: data.join(""),
    recordCounts: {
      "100A": 1,
      "100B": 0,
      "110B": 0,
      "100C": cCount,
      "110D": dCount,
      "120D": d120Count,
      "100M": 0,
      "900Z": 1,
    },
    primaryId: id,
    generatedAt,
  };
}


export type SimulatorFixtureResult = UniformExportResult & {
  simulatorRecords: number;
  simulatorBytes: number;
  documentTypesCovered: number[];
};

function genericHeader(
  business: BusinessInfo,
  client: Client,
  code: number,
  number: string,
  recordNo: number,
  linkId: number,
  date: string,
): string {
  const r = blank(444);
  field(r, 1, 4, "100C");
  field(r, 5, 9, n(recordNo, 9), true);
  field(r, 14, 9, business.taxId, true);
  field(r, 23, 3, n(code, 3), true);
  field(r, 26, 20, docNumber(number));
  field(r, 46, 8, date8(date), true);
  field(r, 54, 4, "1200", true);
  field(r, 58, 50, client.name);
  field(r, 108, 50, client.address || "");
  field(r, 206, 30, "");
  field(r, 236, 2, "IL");
  field(r, 238, 15, client.phone || "");
  if (client.taxId) field(r, 253, 9, n(client.taxId, 9), true);
  field(r, 262, 8, date8(date), true);
  field(r, 288, 15, amount(100));
  field(r, 303, 15, amount(0));
  field(r, 318, 15, amount(100));
  field(r, 333, 15, amount(18));
  field(r, 348, 15, amount(118));
  field(r, 363, 12, amount(0, 9, 2));
  field(r, 375, 15, client.id);
  field(r, 401, 8, date8(date), true);
  field(r, 425, 7, n(linkId, 7), true);
  return line(r);
}

function genericDetail(
  business: BusinessInfo,
  code: number,
  number: string,
  recordNo: number,
  rowNo: number,
  linkId: number,
  date: string,
): string {
  const r = blank(339);
  field(r, 1, 4, "110D");
  field(r, 5, 9, n(recordNo, 9), true);
  field(r, 14, 9, business.taxId, true);
  field(r, 23, 3, n(code, 3), true);
  field(r, 26, 20, docNumber(number));
  field(r, 46, 4, n(rowNo, 4), true);
  field(r, 73, 1, "1", true);
  field(r, 74, 20, "SIM-" + code + "-" + rowNo);
  field(r, 94, 30, "פריט בדיקה " + code);
  field(r, 204, 20, "יחידה");
  field(r, 224, 17, qty(1));
  field(r, 241, 15, amount(100));
  field(r, 256, 15, amount(0));
  field(r, 271, 15, amount(100));
  field(r, 286, 4, "1800", true);
  field(r, 297, 8, date8(date), true);
  field(r, 305, 7, n(linkId, 7), true);
  return line(r);
}

function genericReceiptDetail(
  business: BusinessInfo,
  code: number,
  number: string,
  recordNo: number,
  linkId: number,
  date: string,
): string {
  const r = blank(222);
  field(r, 1, 4, "120D");
  field(r, 5, 9, n(recordNo, 9), true);
  field(r, 14, 9, business.taxId, true);
  field(r, 23, 3, n(code, 3), true);
  field(r, 26, 20, docNumber(number));
  field(r, 46, 4, "1", true);
  field(r, 50, 1, "1", true);
  field(r, 96, 8, date8(date), true);
  field(r, 104, 15, amount(118));
  field(r, 148, 8, date8(date), true);
  field(r, 156, 7, n(linkId, 7), true);
  return line(r);
}

function syntheticB110(business: BusinessInfo, recordNo: number, accountNo: number): string {
  const r = blank(376);
  field(r, 1, 4, "110B");
  field(r, 5, 9, n(recordNo, 9), true);
  field(r, 14, 9, business.taxId, true);
  const key = "SIMACC" + n(accountNo, 9);
  field(r, 23, 15, key);
  field(r, 38, 50, "חשבון סימולציה " + accountNo);
  field(r, 88, 15, "SIM");
  field(r, 103, 30, "חשבון בדיקה");
  field(r, 231, 30, "ישראל");
  field(r, 261, 2, "IL");
  field(r, 278, 15, amount(0));
  field(r, 293, 15, amount(0));
  field(r, 308, 15, amount(0));
  return line(r);
}

function syntheticB100(business: BusinessInfo, recordNo: number, transactionNo: number, rowNo: number, accountNo: number): string {
  const r = blank(317);
  field(r, 1, 4, "100B");
  field(r, 5, 9, n(recordNo, 9), true);
  field(r, 14, 9, business.taxId, true);
  field(r, 23, 10, n(transactionNo, 10), true);
  field(r, 33, 5, n(rowNo, 5), true);
  field(r, 38, 8, n(transactionNo, 8), true);
  field(r, 46, 15, "SIMULATION");
  field(r, 61, 20, "SIM-" + transactionNo);
  field(r, 107, 50, "תנועת בדיקה");
  field(r, 157, 8, "20260922", true);
  field(r, 165, 8, "20260922", true);
  field(r, 173, 15, "SIMACC" + n(accountNo, 9));
  field(r, 188, 15, "SIMACC" + n(accountNo + 1, 9));
  field(r, 203, 1, rowNo % 2 ? "1" : "2", true);
  field(r, 204, 3, "ILS");
  field(r, 207, 15, amount(100));
  field(r, 222, 15, amount(0));
  field(r, 237, 12, n(1, 12), true);
  field(r, 276, 8, "20260922", true);
  return line(r);
}

function syntheticM100(business: BusinessInfo, recordNo: number, itemNo: number): string {
  const r = blank(298);
  field(r, 1, 4, "100M");
  field(r, 5, 9, n(recordNo, 9), true);
  field(r, 14, 9, business.taxId, true);
  field(r, 23, 20, "SIMITEM" + n(itemNo, 12));
  field(r, 63, 20, "SIMITEM" + n(itemNo, 12));
  field(r, 83, 20, "INT" + n(itemNo, 17));
  field(r, 103, 50, "פריט סימולציה " + itemNo);
  field(r, 173, 20, "יחידה");
  field(r, 193, 12, n(10, 12), true);
  field(r, 205, 12, n(20, 12), true);
  field(r, 217, 12, n(5, 12), true);
  field(r, 229, 10, "0000000100", true);
  return line(r);
}

export function buildSimulatorFixture(input: UniformExportInput): SimulatorFixtureResult {
  assert(/^\d{9}$/.test(input.business.taxId), "BUSINESS_TAX_ID_MUST_BE_9_DIGITS");
  const configErrors = validateUniformExportConfig(input.config);
  assert(configErrors.length === 0, configErrors.join(","));
  const generatedAt = input.generatedAt || new Date();
  const id = primaryId();
  const codes = [
    100, 200, 205, 210, 300, 305, 310, 320, 330, 340, 345, 400, 405,
    410, 420, 500, 600, 610, 700, 710, 800, 810, 820, 830, 840, 900, 910,
  ];
  const client: Client = input.clients[0] || {
    id: "SIMCLIENT",
    name: "לקוח סימולציה",
    taxId: "123456782",
    isVatRegistered: true,
  };
  const data: string[] = [];
  let seq = 1;
  const counts: Record<string, number> = { "100A": 1, "100B": 0, "110B": 0, "100C": 0, "110D": 0, "120D": 0, "100M": 0, "900Z": 1 };
  data.push(opening(input.business.taxId, id));

  for (const code of codes) {
    for (let i = 1; i <= 10; i++) {
      const linkId = seq + 1;
      const number = "SIM" + String(code) + String(i).padStart(4, "0");
      data.push(genericHeader(input.business, client, code, number, ++seq, linkId, "2026-09-22"));
      counts["100C"]++;
      data.push(genericDetail(input.business, code, number, ++seq, 1, linkId, "2026-09-22"));
      counts["110D"]++;
      if (code === 400 || code === 405) {
        data.push(genericReceiptDetail(input.business, code, number, ++seq, linkId, "2026-09-22"));
        counts["120D"]++;
      }
    }
  }

  for (let i = 1; i <= 600; i++) {
    data.push(syntheticB110(input.business, ++seq, i));
    counts["110B"]++;
  }
  for (let i = 1; i <= 900; i++) {
    data.push(syntheticB100(input.business, ++seq, i, (i % 3) + 1, (i % 600) + 1));
    counts["100B"]++;
  }
  for (let i = 1; i <= 200; i++) {
    data.push(syntheticM100(input.business, ++seq, i));
    counts["100M"]++;
  }

  data.push(closing(input.business.taxId, id, data.length + 1));
  const total = data.length;
  const iniText = [
    ini(input.business, input.config, total, id, input.fromDate, input.toDate, generatedAt),
    summary("100B", counts["100B"]),
    summary("110B", counts["110B"]),
    summary("100C", counts["100C"]),
    summary("110D", counts["110D"]),
    summary("120D", counts["120D"]),
    summary("100M", counts["100M"]),
  ].join("");
  const result: UniformExportResult = {
    iniText,
    bkmvdataText: data.join(""),
    recordCounts: counts,
    primaryId: id,
    generatedAt,
  };
  const bytes = toUniformDownloadBytes(result.bkmvdataText).byteLength;
  const validation = validateUniformExportText(result);
  validation.push(...validateSimulatorPayload(bytes, total));
  assert(validation.length === 0, validation.join(","));
  return { ...result, simulatorRecords: total, simulatorBytes: bytes, documentTypesCovered: codes };
}

export type UniformPrintReportRow = { code: number; description: string; count: number; total: number };

export function buildUniformPrintReport(input: UniformExportInput, result: UniformExportResult) {
  const docs = input.docs.filter(d => d.issueDate >= input.fromDate && d.issueDate <= input.toDate && d.status !== "draft");
  const definitions: Array<[number, string]> = [
    [100, "הזמנה"], [200, "תעודת משלוח"], [205, "תעודת משלוח סוכן"], [210, "תעודת החזרה"],
    [300, "חשבונית/חשבונית עסקה"], [305, "חשבונית-מס"], [310, "חשבונית ריכוז"], [320, "חשבונית מס / קבלה"],
    [330, "חשבונית מס זיכוי"], [340, "חשבונית שריון"], [345, "חשבונית סוכן"], [400, "קבלה"],
    [405, "קבלה על תרומות"], [410, "יציאה מקופה"], [420, "הפקדת בנק"], [500, "הזמנת רכש"],
    [600, "תעודת משלוח רכש"], [610, "החזרת רכש"], [700, "חשבונית מס רכש"], [710, "זיכוי רכש"],
    [800, "יתרת פתיחה"], [810, "כניסה כללית למלאי"], [820, "יציאה כללית מהמלאי"], [830, "העברה בין מחסנים"],
    [840, "עדכון בעקבות ספירה"], [900, "דוח ייצור-כניסה"], [910, "דוח ייצור-יציאה"],
  ];
  const map: Record<number, UniformPrintReportRow> = {};
  for (const [code, description] of definitions) map[code] = { code, description, count: 0, total: 0 };
  for (const doc of docs) {
    const code = docType(doc);
    const t = totals(doc).total;
    map[code].count += 1;
    map[code].total += t;
  }
  return {
    businessTaxId: input.business.taxId,
    businessName: input.business.name,
    fromDate: input.fromDate,
    toDate: input.toDate,
    primaryId: result.primaryId,
    generatedAt: result.generatedAt,
    recordCounts: result.recordCounts,
    documents: Object.values(map),
    softwareName: input.config.softwareName,
    softwareVersion: input.config.softwareVersion,
    registrationNumber: input.config.registrationNumber,
  };
}

export function validateUniformExportText(result: UniformExportResult): string[] {
  const errors: string[] = [];
  const iniLines = result.iniText.split(CRLF).filter(Boolean);
  const dataLines = result.bkmvdataText.split(CRLF).filter(Boolean);
  const lengths: Record<string, number> = {
    "000A": 466, "100A": 95, "100B": 317, "110B": 376, "100C": 444, "110D": 339, "120D": 222, "100M": 298, "900Z": 110,
  };
  if (!iniLines[0] || iniLines[0].slice(0, 4) !== "000A") errors.push("INI_MISSING_000A");
  if (!dataLines[0] || dataLines[0].slice(0, 4) !== "100A") errors.push("DATA_MISSING_100A");
  if (!dataLines[dataLines.length - 1] || dataLines[dataLines.length - 1].slice(0, 4) !== "900Z") errors.push("DATA_MISSING_900Z");

  for (const l of iniLines) {
    const code = l.slice(0, 4);
    const expected = code === "000A" ? 466 : 19;
    if (iso88598(l).length !== expected) errors.push("INI_LENGTH_" + code);
  }
  for (const l of dataLines) {
    const code = l.slice(0, 4);
    if (!lengths[code]) errors.push("UNKNOWN_RECORD_" + code);
    else if (iso88598(l).length !== lengths[code]) errors.push("RECORD_LENGTH_" + code);
  }
  for (let i = 0; i < dataLines.length; i++) {
    if (dataLines[i].slice(4, 13) !== n(i + 1, 9)) errors.push("RECORD_SEQUENCE_" + (i + 1));
  }
  return errors;
}

export function validateSimulatorPayload(bytes: number, records: number): string[] {
  const errors: string[] = [];
  if (records < 2000) errors.push("MINIMUM_2000_RECORDS");
  if (bytes > 4 * 1024 * 1024) errors.push("MAXIMUM_4MB");
  return errors;
}

export function toUniformDownloadBytes(text: string): Uint8Array {
  const lines = text.split(CRLF).filter(Boolean);
  const encoded = lines.map(iso88598);
  const size = encoded.reduce((sum, x) => sum + x.length + 2, 0);
  const out = new Uint8Array(size);
  let offset = 0;
  for (const bytes of encoded) {
    out.set(bytes, offset);
    offset += bytes.length;
    out[offset++] = 13;
    out[offset++] = 10;
  }
  return out;
}
