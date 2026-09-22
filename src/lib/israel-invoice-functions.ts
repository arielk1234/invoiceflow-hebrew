import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import {
  buildAllocationRequest,
  parseAllocationResponse,
} from "./israel-invoice-api";
import { requiresAllocationNumber } from "./israel-compliance";

const inputSchema = z.object({
  documentId: z.string().uuid(),
  accessToken: z.string().min(20),
});

type RequestRow = Database["public"]["Tables"]["tax_authority_requests"]["Row"];

function createServerSupabase(accessToken: string) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_SERVER_CONFIGURATION_MISSING");

  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  });
}

export const requestIsraelAllocation = createServerFn({ method: "POST" })
  .validator(inputSchema)
  .handler(async ({ data }) => {
    const supabase = createServerSupabase(data.accessToken);

    const { data: document, error: documentError } = await supabase
      .from("documents")
      .select("*, clients:client_id(*), businesses:business_id(*)")
      .eq("id", data.documentId)
      .single();

    if (documentError || !document) {
      throw new Error("DOCUMENT_NOT_FOUND");
    }

    if (document.status !== "draft") {
      throw new Error("DOCUMENT_NOT_DRAFT");
    }

    const client = document.clients as Database["public"]["Tables"]["clients"]["Row"] | null;
    const business = document.businesses as Database["public"]["Tables"]["businesses"]["Row"] | null;

    if (!client || !business) throw new Error("DOCUMENT_RELATIONS_NOT_FOUND");

    const { data: items, error: itemsError } = await supabase
      .from("document_items")
      .select("*")
      .eq("document_id", document.id)
      .order("position", { ascending: true });

    if (itemsError) throw itemsError;

    const subtotal = Number((items ?? []).reduce(
      (sum, item) => sum + Number(item.quantity) * Number(item.unit_price),
      0,
    ).toFixed(2));
    const vatAmount = Number((subtotal * Number(document.vat_rate) / 100).toFixed(2));
    const totalAmount = Number((subtotal + vatAmount).toFixed(2));

    if (!requiresAllocationNumber({
      issueDate: document.issue_date,
      subtotalBeforeVat: subtotal,
      vatRate: Number(document.vat_rate),
      clientIsVatRegistered: Boolean(client.is_vat_registered),
      clientRequestedAllocation: Boolean(document.allocation_requested),
    })) {
      return {
        required: false,
        documentId: document.id,
        documentNumber: document.number || null,
        allocationNumber: document.allocation_number || null,
      };
    }

    if (document.allocation_number && /^\d{9}$/.test(document.allocation_number)) {
      return {
        required: true,
        documentId: document.id,
        documentNumber: document.number || null,
        allocationNumber: document.allocation_number,
      };
    }

    const { data: reservedNumber, error: reserveError } = await supabase.rpc(
      "reserve_document_number",
      { _document_id: document.id },
    );
    if (reserveError) throw reserveError;

    const idempotencyKey = `allocation:${document.id}`;
    const { data: request, error: requestError } = await supabase.rpc(
      "begin_tax_authority_request",
      { _document_id: document.id, _idempotency_key: idempotencyKey },
    );
    if (requestError) throw requestError;

    const requestRow = request as RequestRow;

    if (requestRow.status === "approved" && document.allocation_number) {
      return {
        required: true,
        documentId: document.id,
        documentNumber: reservedNumber,
        allocationNumber: document.allocation_number,
      };
    }

    if (requestRow.status === "submitted") {
      throw new Error("ALLOCATION_REQUEST_AMBIGUOUS_RETRY_BLOCKED");
    }

    const accessTokenForTaxAuthority = process.env.ISRAEL_INVOICE_API_ACCESS_TOKEN;
    if (!accessTokenForTaxAuthority) {
      await supabase.rpc("update_tax_authority_request", {
        _request_id: requestRow.id,
        _status: "failed",
        _error_code: "API_NOT_CONFIGURED",
        _error_message: "ISRAEL_INVOICE_API_ACCESS_TOKEN is not configured",
      });
      throw new Error("ISRAEL_INVOICE_API_NOT_CONFIGURED");
    }

    const requestBody = buildAllocationRequest({
      invoiceId: document.id,
      invoiceType: document.type === "invoice" ? 305 : document.type === "credit_note" ? 330 : 320,
      customerVatNumber: client.tax_id,
      issuerVatNumber: business.tax_id,
      customerName: client.name,
      subtotalBeforeVat: subtotal,
      vatAmount,
      totalAmount,
      issueDate: document.issue_date,
      invoiceNumber: reservedNumber,
    });

    await supabase.rpc("update_tax_authority_request", {
      _request_id: requestRow.id,
      _status: "submitted",
    });

    const endpoint =
      process.env.ISRAEL_INVOICE_API_BASE_URL ||
      "https://ita-api.taxes.gov.il/shaam/tsandbox/Invoices/v2/Approval";

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessTokenForTaxAuthority}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });
    } catch {
      throw new Error("ALLOCATION_API_NETWORK_ERROR");
    }

    const payload: unknown = await response.json().catch(() => null);
    const allocationNumber = parseAllocationResponse(payload);

    if (!response.ok) {
      await supabase.rpc("update_tax_authority_request", {
        _request_id: requestRow.id,
        _status: "failed",
        _response_payload: payload as never,
        _error_code: `HTTP_${response.status}`,
        _error_message: "Tax Authority API request failed",
      });
      throw new Error("ALLOCATION_API_ERROR");
    }

    if (!allocationNumber) {
      await supabase.rpc("update_tax_authority_request", {
        _request_id: requestRow.id,
        _status: "rejected",
        _response_payload: payload as never,
        _error_code: "ALLOCATION_NOT_APPROVED",
        _error_message: "No valid confirmation number was returned",
      });
      throw new Error("ALLOCATION_NOT_APPROVED");
    }

    const { error: allocationUpdateError } = await supabase
      .from("documents")
      .update({
        allocation_number: allocationNumber,
        allocation_requested_at: new Date().toISOString(),
      })
      .eq("id", document.id)
      .eq("status", "draft");

    if (allocationUpdateError) throw allocationUpdateError;

    await supabase.rpc("update_tax_authority_request", {
      _request_id: requestRow.id,
      _status: "approved",
      _external_reference: allocationNumber,
      _response_payload: payload as never,
    });

    return {
      required: true,
      documentId: document.id,
      documentNumber: reservedNumber,
      allocationNumber,
    };
  });
