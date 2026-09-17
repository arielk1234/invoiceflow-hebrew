/**
 * Uniform Format 1.31 compliance boundary.
 *
 * The Tax Authority specification requires INI.TXT and BKMVDATA.TXT and
 * defines fixed record codes/lengths. We keep the official schema metadata
 * centralized here so the exporter cannot silently drift between screens.
 * Field serialization should be implemented from the official 1.31 field
 * tables; no undocumented fields are invented here.
 */

export const UNIFORM_FORMAT_VERSION = "1.31";

export const UNIFORM_RECORDS = {
  A000: { file: "INI.TXT", description: "רשומה מרכזית", length: 466 },
  B100_SUMMARY: { file: "INI.TXT", code: "B100", description: "סך רשומות תנועות הנה\"ח", length: 19 },
  B110_SUMMARY: { file: "INI.TXT", code: "B110", description: "סך רשומות חשבונות", length: 19 },
  C100_SUMMARY: { file: "INI.TXT", code: "C100", description: "סך רשומות כותרת מסמך", length: 19 },
  D110_SUMMARY: { file: "INI.TXT", code: "D110", description: "סך רשומות פרטי מסמך", length: 19 },
  D120_SUMMARY: { file: "INI.TXT", code: "D120", description: "סך רשומות פרטי קבלה", length: 19 },
  M100_SUMMARY: { file: "INI.TXT", code: "M100", description: "סך רשומות פריטים במלאי", length: 19 },
  A100: { file: "BKMVDATA.TXT", description: "רשומת פתיחה", length: 95 },
  B100: { file: "BKMVDATA.TXT", description: "תנועות בהנה\"ח", length: 317 },
  B110: { file: "BKMVDATA.TXT", description: "חשבון בהנהלת חשבונות", length: 376 },
  C100: { file: "BKMVDATA.TXT", description: "כותרת מסמך", length: 444 },
  D110: { file: "BKMVDATA.TXT", description: "פרטי מסמך", length: 339 },
  D120: { file: "BKMVDATA.TXT", description: "פרטי קבלה", length: 222 },
  M100: { file: "BKMVDATA.TXT", description: "פריט במלאי", length: 298 },
  Z900: { file: "BKMVDATA.TXT", description: "רשומת סגירה", length: 110 },
} as const;

export type UniformRecordCode =
  | "A100"
  | "B100"
  | "B110"
  | "C100"
  | "D110"
  | "D120"
  | "M100"
  | "Z900";

export type UniformExportSummary = {
  taxId: string;
  businessName: string;
  fromDate: string;
  toDate: string;
  counts: Partial<Record<UniformRecordCode, number>>;
};

export function validateUniformExportSummary(summary: UniformExportSummary): string[] {
  const errors: string[] = [];
  if (!/^\d{9}$/.test(summary.taxId)) errors.push("INVALID_TAX_ID");
  if (!summary.businessName.trim()) errors.push("MISSING_BUSINESS_NAME");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(summary.fromDate)) errors.push("INVALID_FROM_DATE");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(summary.toDate)) errors.push("INVALID_TO_DATE");
  return errors;
}

/**
 * The registration simulator currently requires at least 2,000 records and
 * a file no larger than 4MB. This is a preflight guard, not a simulator.
 */
export function validateSimulatorPayload(bytes: number, records: number): string[] {
  const errors: string[] = [];
  if (records < 2000) errors.push("MINIMUM_2000_RECORDS");
  if (bytes > 4 * 1024 * 1024) errors.push("MAXIMUM_4MB");
  return errors;
}
