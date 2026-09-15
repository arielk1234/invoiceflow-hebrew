import type { BusinessInfo, Doc } from "./store";

/**
 * Regulatory-domain rules shared by the UI and the future server issuance endpoint.
 * The authoritative accounting source must be the server/database before production.
 */
export const ISRAEL_2026 = {
  allocationThresholdBeforeVat: 5000,
  uniformFormat: {
    // The Tax Authority simulator currently requests 1.31. Keep this explicit
    // and do not invent a future schema/version here.
    simulatorVersion: "1.31",
    minimumRecords: 2000,
    maximumBytes: 4 * 1024 * 1024,
  },
} as const;

export function validateDocumentForIssuance(business: BusinessInfo, doc: Doc): string[] {
  const errors: string[] = [];
  if (doc.status !== "draft") errors.push("רק טיוטה ניתנת להפקה");
  if (!doc.clientId) errors.push("יש לבחור לקוח");
  if (!doc.items.length) errors.push("יש להזין לפחות שורת חיוב אחת");
  if (doc.items.some((item) => !item.description.trim())) errors.push("לכל שורת חיוב נדרש תיאור");
  if (doc.items.some((item) => item.quantity <= 0 || !Number.isFinite(item.quantity))) errors.push("הכמות חייבת להיות מספר חיובי");
  if (doc.items.some((item) => item.unitPrice < 0 || !Number.isFinite(item.unitPrice))) errors.push("המחיר אינו תקין");
  if (doc.vatRate < 0 || doc.vatRate > 100 || !Number.isFinite(doc.vatRate)) errors.push("שיעור המע״מ אינו תקין");
  if (business.businessType === "exempt" && (doc.type === "invoice" || doc.type === "creditNote")) {
    errors.push("עוסק פטור אינו יכול להפיק חשבונית מס או חשבונית זיכוי");
  }
  if (doc.type === "creditNote" && !doc.relatedDocId) errors.push("חשבונית זיכוי חייבת להיות מקושרת למסמך המקורי");
  if (requiresAllocation(doc) && !doc.allocationNumber) errors.push("נדרש מספר הקצאה לפני הפקת החשבונית");
  return errors;
}

export function requiresAllocation(doc: Pick<Doc, "type" | "vatRate" | "items">): boolean {
  if (doc.type !== "invoice" || doc.vatRate <= 0) return false;
  const subtotal = doc.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  return subtotal > ISRAEL_2026.allocationThresholdBeforeVat;
}

/**
 * Boundary for the official Uniform Format implementation.
 * Do not put guessed fields here. The exporter must be generated from the
 * exact official specification selected for the registration submission.
 */
export interface UniformFormatExporter {
  readonly specificationVersion: string;
  export(records: readonly unknown[]): string | Uint8Array;
}

export type ComplianceRegistrationChecklist = {
  softwareVersion: string;
  uniformFormatSpecification: string;
  simulatorOutputAttached: boolean;
  printedOutputsAttached: boolean;
  professionalReviewComplete: boolean;
  registrationSubmitted: boolean;
};

export function assertNotRegistered(checklist: ComplianceRegistrationChecklist): void {
  if (checklist.registrationSubmitted) {
    throw new Error("סטטוס הרישום חייב להיקבע לפי האישור בפועל מרשות המסים ולא לפי קוד התוכנה");
  }
}
