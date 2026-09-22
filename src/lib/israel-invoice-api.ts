/**
 * Israel Tax Authority — Israel Invoice allocation API contract.
 *
 * Based on the official Tax Authority "Israel Invoice Model" API document:
 * Invoice-Information/confirmationNumber (V1.0 beta).
 *
 * The official document specifies OAuth2 User Restricted and these endpoints:
 * Sandbox: https://ita-api.taxes.gov.il/shaam/tsandbox/invoice-information/v1/confirmationNumber
 * Production: https://openapi.taxes.gov.il/shaam/production/invoice-information/v1/confirmationNumber
 *
 * Source: https://www.gov.il/BlobFolder/generalpage/hor-software-other/he/vat_software-houses-180724.pdf
 */

import { allocationThresholdForDate } from "./israel-compliance";

export const ISRAEL_INVOICE_API_PRODUCTION_URL =
  "https://openapi.taxes.gov.il/shaam/production/invoice-information/v1/confirmationNumber";

export const ISRAEL_INVOICE_API_SANDBOX_URL =
  "https://ita-api.taxes.gov.il/shaam/tsandbox/invoice-information/v1/confirmationNumber";

export type AllocationRequest = {
  Customer_VAT_Number: string;
  Vat_Number: string;
  Payment_Amount: number;
  VAT_Amount: number;
  Invoice_Date: string;
  Invoice_Reference_Number?: string;
};

export type AllocationResponse = {
  Confirmation_Number?: string | number;
  confirmation_number?: string | number;
  [key: string]: unknown;
};

export function shouldRequestAllocation(input: {
  issueDate: string;
  subtotalBeforeVat: number;
  vatRate: number;
  clientIsVatRegistered: boolean;
  clientRequestedAllocation: boolean;
}): boolean {
  return (
    input.subtotalBeforeVat > allocationThresholdForDate(input.issueDate) &&
    input.vatRate > 0 &&
    input.clientIsVatRegistered &&
    input.clientRequestedAllocation
  );
}

export function buildAllocationRequest(input: {
  customerVatNumber: string;
  issuerVatNumber: string;
  subtotalBeforeVat: number;
  vatAmount: number;
  issueDate: string;
  invoiceNumber?: string;
}): AllocationRequest {
  const customerVatNumber = String(input.customerVatNumber).trim();
  const issuerVatNumber = String(input.issuerVatNumber).trim();

  if (!/^\d{9}$/.test(customerVatNumber)) {
    throw new Error("INVALID_CUSTOMER_VAT_NUMBER");
  }
  if (!/^\d{9}$/.test(issuerVatNumber)) {
    throw new Error("INVALID_ISSUER_VAT_NUMBER");
  }

  return {
    Customer_VAT_Number: customerVatNumber,
    Vat_Number: issuerVatNumber,
    Payment_Amount: Number(input.subtotalBeforeVat.toFixed(2)),
    VAT_Amount: Number(input.vatAmount.toFixed(2)),
    Invoice_Date: input.issueDate,
    ...(input.invoiceNumber ? { Invoice_Reference_Number: input.invoiceNumber } : {}),
  };
}

export function parseAllocationResponse(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const response = payload as AllocationResponse;
  const raw = response.Confirmation_Number ?? response.confirmation_number;
  const value = typeof raw === "number" ? String(raw) : raw;
  if (!value || !/^\d{9}$/.test(value)) return null;
  return value;
}
