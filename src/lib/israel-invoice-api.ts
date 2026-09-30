/**
 * Israel Tax Authority — Israel Invoice allocation API contract.
 *
 * Based on the official Tax Authority document "מודל חשבוניות ישראל — תיאור ה-API's",
 * edition 2.0 (7.2024), section 2.3: Approval V2.
 * Source: https://www.gov.il/BlobFolder/generalpage/hor-software-other/he/vat_software-houses-180724.pdf
 *
 * Invoice-Information/confirmationNumber (section 3.3 of the same document) only
 * retrieves the number of an invoice that was already approved; it does not
 * request a new allocation, so it must not be used for issuance.
 *
 * Authorization is OAuth2 User Restricted (see israel-invoice-oauth.ts).
 */

import { isValidAllocationNumber } from "./israel-compliance";

export const ISRAEL_INVOICE_APPROVAL_URL = {
  sandbox: "https://ita-api.taxes.gov.il/shaam/tsandbox/Invoices/v2/Approval",
  production: "https://ita-api.taxes.gov.il/shaam/production/Invoices/v2/Approval",
} as const;

/** Document type code for a tax invoice (חשבונית מס), table 2.5. */
export const TAX_INVOICE_TYPE_CODE = 305;

/** Request body, table 2.1. Optional and "future use" fields are omitted. */
export type ApprovalRequest = {
  invoice_id: string;
  invoice_type: number;
  vat_number: number;
  user_name: string;
  invoice_reference_number: string;
  customer_vat_number: number;
  customer_name?: string;
  invoice_date: string;
  invoice_issuance_date: string;
  accounting_software_number: number;
  client_software_key?: string;
  amount_before_discount: number;
  discount: number;
  payment_amount: number;
  vat_amount: number;
  payment_amount_including_vat: number;
};

export type ApprovalError = { code?: number; message?: string; param?: string; location?: string };

export type ApprovalResult =
  | { kind: "approved"; confirmationNumber: string }
  /** 460 not approved, 461 not approved and no decision sent yet, 462 decision already sent. */
  | { kind: "not_approved"; code: 460 | 461 | 462 }
  | { kind: "invalid"; code: number | null };

const NINE_DIGITS = /^\d{9}$/;
/** The registration certificate number: 8 digits in the Uniform Format (1006), N9 in the API. */
const REGISTRATION_NUMBER = /^\d{8,9}$/;
const money = (n: number) => Number(n.toFixed(2));

export function buildApprovalRequest(input: {
  invoiceId: string;
  invoiceType: number;
  issuerVatNumber: string;
  customerVatNumber: string;
  customerName: string;
  invoiceReferenceNumber: string;
  invoiceDate: string;
  issuanceDate: string;
  userName: string;
  softwareRegistrationNumber: string;
  clientSoftwareKey: string;
  subtotalBeforeVat: number;
  vatAmount: number;
}): ApprovalRequest {
  const issuerVatNumber = String(input.issuerVatNumber).trim();
  const customerVatNumber = String(input.customerVatNumber).trim();
  const softwareRegistrationNumber = String(input.softwareRegistrationNumber).trim();

  if (!NINE_DIGITS.test(customerVatNumber)) throw new Error("INVALID_CUSTOMER_VAT_NUMBER");
  if (!NINE_DIGITS.test(issuerVatNumber)) throw new Error("INVALID_ISSUER_VAT_NUMBER");
  if (!REGISTRATION_NUMBER.test(softwareRegistrationNumber))
    throw new Error("INVALID_SOFTWARE_REGISTRATION_NUMBER");
  if (!input.invoiceReferenceNumber || input.invoiceReferenceNumber.length > 20) {
    throw new Error("INVALID_INVOICE_REFERENCE_NUMBER");
  }

  const subtotal = money(input.subtotalBeforeVat);
  const vat = money(input.vatAmount);
  const customerName = input.customerName.trim().slice(0, 25);

  return {
    invoice_id: input.invoiceId,
    invoice_type: input.invoiceType,
    vat_number: Number(issuerVatNumber),
    user_name: input.userName.slice(0, 25),
    invoice_reference_number: input.invoiceReferenceNumber,
    customer_vat_number: Number(customerVatNumber),
    ...(customerName ? { customer_name: customerName } : {}),
    invoice_date: input.invoiceDate,
    invoice_issuance_date: input.issuanceDate,
    accounting_software_number: Number(softwareRegistrationNumber),
    client_software_key: input.clientSoftwareKey.slice(0, 50),
    amount_before_discount: subtotal,
    discount: 0,
    payment_amount: subtotal,
    vat_amount: vat,
    payment_amount_including_vat: money(subtotal + vat),
  };
}

function approvalErrors(payload: Record<string, unknown>): ApprovalError[] {
  const message = payload.message;
  if (
    message &&
    typeof message === "object" &&
    Array.isArray((message as { errors?: unknown }).errors)
  ) {
    return (message as { errors: ApprovalError[] }).errors;
  }
  return [];
}

/**
 * When an invoice is not approved (460/461), the user chooses how to continue
 * and the Tax Authority is told through Invoice-decision V1 (section 4).
 * The fourth alternative, charge reversal, is a new zero-rate Approval request
 * (action=3) that needs the customer's consent; it is not offered here yet.
 */
export const ALLOCATION_DECISIONS = ["continue", "cancel", "further_objection"] as const;
export type AllocationDecision = (typeof ALLOCATION_DECISIONS)[number];

const DECISION_PATH: Record<AllocationDecision, string> = {
  cancel: "Cancel",
  continue: "Continue",
  further_objection: "FurtherObjection",
};

export function invoiceDecisionUrl(
  environment: "sandbox" | "production",
  decision: AllocationDecision,
): string {
  const env = environment === "production" ? "production" : "tsandbox";
  return `https://ita-api.taxes.gov.il/shaam/${env}/Invoice-decision/v1/${DECISION_PATH[decision]}`;
}

/** Request body, table 4.1. */
export type DecisionRequest = {
  invoice_id: string;
  vat_number: number;
  user_name: string;
  accounting_software_number: number;
};

export function buildDecisionRequest(input: {
  invoiceId: string;
  issuerVatNumber: string;
  userName: string;
  softwareRegistrationNumber: string;
}): DecisionRequest {
  const issuerVatNumber = String(input.issuerVatNumber).trim();
  const softwareRegistrationNumber = String(input.softwareRegistrationNumber).trim();
  if (!NINE_DIGITS.test(issuerVatNumber)) throw new Error("INVALID_ISSUER_VAT_NUMBER");
  if (!REGISTRATION_NUMBER.test(softwareRegistrationNumber))
    throw new Error("INVALID_SOFTWARE_REGISTRATION_NUMBER");

  return {
    invoice_id: input.invoiceId,
    vat_number: Number(issuerVatNumber),
    user_name: input.userName.slice(0, 25),
    accounting_software_number: Number(softwareRegistrationNumber),
  };
}

/** Success is HTTP 200 "Decision accepted"; 463 means no held invoice matches. */
export function parseDecisionResponse(
  httpStatus: number,
  payload: unknown,
): { accepted: true } | { accepted: false; code: number | null } {
  const codes =
    payload && typeof payload === "object"
      ? approvalErrors(payload as Record<string, unknown>).map((e) => Number(e.code))
      : [];
  if (httpStatus === 200 && codes.length === 0) return { accepted: true };
  return { accepted: false, code: codes.find((c) => Number.isFinite(c)) ?? null };
}

/**
 * Parses an Approval V2 response (success and error examples in section 2.3).
 * A confirmation number of "0" or approved=false means no allocation was given.
 */
export function parseApprovalResponse(payload: unknown): ApprovalResult {
  if (!payload || typeof payload !== "object") return { kind: "invalid", code: null };
  const response = payload as Record<string, unknown>;

  const raw = response.confirmation_number;
  const confirmationNumber =
    typeof raw === "number" ? String(raw) : typeof raw === "string" ? raw.trim() : "";
  if (response.approved === true && isValidAllocationNumber(confirmationNumber)) {
    return { kind: "approved", confirmationNumber };
  }

  const codes = approvalErrors(response).map((e) => Number(e.code));
  const notApproved = codes.find((c): c is 460 | 461 | 462 => c === 460 || c === 461 || c === 462);
  if (notApproved) return { kind: "not_approved", code: notApproved };

  return { kind: "invalid", code: codes.find((c) => Number.isFinite(c)) ?? null };
}
