import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import {
  buildAllocationRequest,
  parseAllocationResponse,
} from "./israel-invoice-api";
import { requiresAllocationNumber } from "./israel-compliance";
import { decryptSecret, encryptSecret, refreshAccessToken } from "./israel-invoice-oauth";

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

    if (document.type !== "invoice") {
      return {
        required: false,
        documentId: document.id,
        documentNumber: document.number || null,
        allocationNumber: document.allocation_number || null,
      };
    }

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

    const environment = (process.env.ISRAEL_INVOICE_API_ENVIRONMENT || "sandbox") as "sandbox" | "production";
    const adminUrl = process.env.SUPABASE_URL;
    const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!adminUrl || !adminKey) throw new Error("SUPABASE_SERVER_CONFIGURATION_MISSING");
    const admin = createClient<Database>(adminUrl, adminKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: connection, error: connectionError } = await admin
      .from("tax_authority_connections")
      .select("*")
      .eq("business_id", document.business_id)
      .eq("environment", environment)
      .eq("provider", "israel_tax_authority")
      .single();

    if (connectionError || !connection?.access_token_ciphertext) {
      throw new Error("ISRAEL_INVOICE_OAUTH_NOT_CONNECTED");
    }

    const customerVat = String(client.tax_id ?? "").trim();
    const issuerVat = String(business.tax_id ?? "").trim();
    if (!/^\d{9}$/.test(customerVat) || !/^\d{9}$/.test(issuerVat)) {
      throw new Error("INVALID_VAT_NUMBER_FOR_ALLOCATION");
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

    let accessTokenForTaxAuthority = decryptSecret(connection.access_token_ciphertext);
    if (!connection.access_token_expires_at || new Date(connection.access_token_expires_at).getTime() <= Date.now() + 60_000) {
      if (!connection.refresh_token_ciphertext) throw new Error("ISRAEL_INVOICE_REFRESH_TOKEN_MISSING");
      const refreshed = await refreshAccessToken(environment, decryptSecret(connection.refresh_token_ciphertext));
      accessTokenForTaxAuthority = refreshed.access_token;
      await admin.from("tax_authority_connections").update({
        access_token_ciphertext: encryptSecret(refreshed.access_token),
        refresh_token_ciphertext: refreshed.refresh_token ? encryptSecret(refreshed.refresh_token) : connection.refresh_token_ciphertext,
        access_token_expires_at: new Date(Date.now() + Number(refreshed.expires_in ?? 1800) * 1000).toISOString(),
        scope: refreshed.scope ?? connection.scope,
        updated_at: new Date().toISOString(),
      }).eq("id", connection.id);
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
      (environment === "production"
        ? "https://openapi.taxes.gov.il/shaam/production/Invoices/v2/Approval"
        : "https://openapi.taxes.gov.il/shaam/tsandbox/Invoices/v2/Approval");

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
      await supabase.rpc("update_tax_authority_request", {
        _request_id: requestRow.id,
        _status: "failed",
        _error_code: "NETWORK_ERROR",
        _error_message: "Tax Authority API network request failed",
      });
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
