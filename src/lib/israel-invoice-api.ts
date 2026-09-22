/**
 * Israel Tax Authority - Israel Invoice allocation API boundary (Approval V2).
 *
 * Official production endpoint documented by the Tax Authority:
 * https://openapi.taxes.gov.il/shaam/production/Invoices/v2/Approval
 *
 * Authentication is OAuth2 User Restricted. Tokens/secrets must stay server-side.
 * This module contains the contract and endpoint only; it does not invent an
 * authentication flow or expose credentials to the browser.
 */

import { allocationThresholdForDate } from "./israel-compliance";

export const ISRAEL_INVOICE_API_PRODUCTION_URL =
  "https://openapi.taxes.gov.il/shaam/production/invoice-information/v1/confirmationNumber";

export const ISRAEL_INVOICE_API_SANDBOX_URL =
  "https://ita-api.taxes.gov.il/shaam/tsandbox/Invoices/v2/Approval";

export type AllocationRequest = {
  invoice_id: string;
  invoice_type: number;
  vat_number: string;
  customer_vat_number: string;
  customer_name: string;
  invoice_date: string;
  invoice_issuance_date: string;
  payment_amount: number;
  vat_amount: number;
  payment_amount_including_vat: number;
  invoice_reference_number: string;
};

export type AllocationResponse = {
  Confirmation_Number?: string;
  invoice_id?: string;
  confirmation_number?: string;
  approved?: boolean;
  Invoice_ID?: string;
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
  invoiceId: string;
  invoiceType: number;
  customerVatNumber: string;
  issuerVatNumber: string;
  customerName: string;
  subtotalBeforeVat: number;
  vatAmount: number;
  totalAmount: number;
  issueDate: string;
  invoiceNumber: string;
}): AllocationRequest {
  return {
    invoice_id: input.invoiceId,
    invoice_type: input.invoiceType,
    vat_number: input.issuerVatNumber,
    customer_vat_number: input.customerVatNumber,
    customer_name: input.customerName,
    invoice_date: input.issueDate,
    invoice_issuance_date: input.issueDate,
    payment_amount: Number(input.subtotalBeforeVat.toFixed(2)),
    vat_amount: Number(input.vatAmount.toFixed(2)),
    payment_amount_including_vat: Number(input.totalAmount.toFixed(2)),
    invoice_reference_number: input.invoiceNumber,
  };
}

