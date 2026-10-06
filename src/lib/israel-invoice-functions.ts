import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import {
  ALLOCATION_DECISIONS,
  buildApprovalRequest,
  buildDecisionRequest,
  invoiceDecisionUrl,
  ISRAEL_INVOICE_APPROVAL_URL,
  parseApprovalResponse,
  parseDecisionResponse,
  TAX_INVOICE_TYPE_CODE,
} from "./israel-invoice-api";
import {
  isValidAllocationNumber,
  isValidIsraeliTaxId,
  requiresAllocationNumber,
} from "./israel-compliance";
import {
  decryptSecret,
  encryptSecret,
  israelInvoiceEnvironment,
  refreshAccessToken,
} from "./israel-invoice-oauth";

/** Issuance date is the system date in Israel, not editable by the user (table 2.1). */
const israelDateToday = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());

const inputSchema = z.object({
  documentId: z.string().uuid(),
  accessToken: z.string().min(20),
});

type RequestRow = Database["public"]["Tables"]["tax_authority_requests"]["Row"];
type BusinessRow = Database["public"]["Tables"]["businesses"]["Row"];

export function createServerSupabase(accessToken: string) {
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

export function createAdminSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_SERVER_CONFIGURATION_MISSING");
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

type AdminSupabase = ReturnType<typeof createAdminSupabase>;

/** Returns a valid Tax Authority access token for the business, refreshing it when needed. */
export async function taxAuthorityAccessToken(
  admin: AdminSupabase,
  businessId: string,
  environment: "sandbox" | "production",
): Promise<string> {
  const { data: connection, error: connectionError } = await admin
    .from("tax_authority_connections")
    .select("*")
    .eq("business_id", businessId)
    .eq("environment", environment)
    .eq("provider", "israel_tax_authority")
    .single();

  if (connectionError || !connection?.access_token_ciphertext) {
    throw new Error("ISRAEL_INVOICE_OAUTH_NOT_CONNECTED");
  }

  if (
    connection.access_token_expires_at &&
    new Date(connection.access_token_expires_at).getTime() > Date.now() + 60_000
  ) {
    return decryptSecret(connection.access_token_ciphertext);
  }

  if (!connection.refresh_token_ciphertext) throw new Error("ISRAEL_INVOICE_REFRESH_TOKEN_MISSING");
  const refreshed = await refreshAccessToken(
    environment,
    decryptSecret(connection.refresh_token_ciphertext),
  );
  await admin
    .from("tax_authority_connections")
    .update({
      access_token_ciphertext: encryptSecret(refreshed.access_token),
      refresh_token_ciphertext: refreshed.refresh_token
        ? encryptSecret(refreshed.refresh_token)
        : connection.refresh_token_ciphertext,
      access_token_expires_at: new Date(
        Date.now() + Number(refreshed.expires_in ?? 1800) * 1000,
      ).toISOString(),
      scope: refreshed.scope ?? connection.scope,
      updated_at: new Date().toISOString(),
    })
    .eq("id", connection.id);
  return refreshed.access_token;
}

/** Internal user id of whoever calls the Tax Authority (tables 2.1 and 4.1, user_name). */
const taxAuthorityUserName = (userId: string) => userId.replace(/-/g, "");

/**
 * Without a software registration certificate, the document issuer's number is
 * reported instead (tables 2.1 and 4.1, accounting_software_number).
 */
const softwareRegistrationNumber = (issuerVat: string) =>
  process.env.ISRAEL_INVOICE_SOFTWARE_REGISTRATION_NUMBER || issuerVat;

export const requestIsraelAllocation = createServerFn({ method: "POST" })
  .validator(inputSchema)
  .handler(async ({ data }) => {
    const supabase = createServerSupabase(data.accessToken);

    // The client key is composite (client_id, business_id), so the relation is
    // named by its constraint; a column hint finds no relationship.
    const { data: document, error: documentError } = await supabase
      .from("documents")
      .select("*, clients!documents_client_id_business_id_fkey(*), businesses:business_id(*)")
      .eq("id", data.documentId)
      .single();

    if (documentError || !document) {
      throw new Error("DOCUMENT_NOT_FOUND");
    }

    if (document.status !== "draft") {
      throw new Error("DOCUMENT_NOT_DRAFT");
    }

    const client = document.clients as unknown as
      Database["public"]["Tables"]["clients"]["Row"] | null;
    const business = document.businesses as unknown as BusinessRow | null;

    if (!client || !business) throw new Error("DOCUMENT_RELATIONS_NOT_FOUND");

    const { data: items, error: itemsError } = await supabase
      .from("document_items")
      .select("*")
      .eq("document_id", document.id)
      .order("position", { ascending: true });

    if (itemsError) throw itemsError;

    const subtotal = Number(
      (items ?? [])
        .reduce((sum, item) => sum + Number(item.quantity) * Number(item.unit_price), 0)
        .toFixed(2),
    );
    const vatAmount = Number(((subtotal * Number(document.vat_rate)) / 100).toFixed(2));
    const totalAmount = Number((subtotal + vatAmount).toFixed(2));

    // Not an invoice, or the business already decided how to continue after the
    // Tax Authority held it (section 4): nothing to request.
    if (
      document.type !== "invoice" ||
      document.allocation_decision === "continue" ||
      document.allocation_decision === "cancel"
    ) {
      return {
        required: false,
        documentId: document.id,
        documentNumber: document.number || null,
        allocationNumber: document.allocation_number || null,
      };
    }

    if (
      !requiresAllocationNumber({
        issueDate: document.issue_date,
        subtotalBeforeVat: subtotal,
        vatRate: Number(document.vat_rate),
        clientIsVatRegistered: Boolean(client.is_vat_registered),
        clientRequestedAllocation: Boolean(document.allocation_requested),
      })
    ) {
      return {
        required: false,
        documentId: document.id,
        documentNumber: document.number || null,
        allocationNumber: document.allocation_number || null,
      };
    }

    if (isValidAllocationNumber(document.allocation_number ?? undefined)) {
      return {
        required: true,
        documentId: document.id,
        documentNumber: document.number || null,
        allocationNumber: document.allocation_number,
      };
    }

    const environment = israelInvoiceEnvironment();
    const admin = createAdminSupabase();

    const customerVat = String(client.tax_id ?? "").trim();
    const issuerVat = String(business.tax_id ?? "").trim();
    if (!isValidIsraeliTaxId(customerVat) || !isValidIsraeliTaxId(issuerVat)) {
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

    const accessTokenForTaxAuthority = await taxAuthorityAccessToken(
      admin,
      document.business_id,
      environment,
    );

    const { data: userResult, error: userError } = await supabase.auth.getUser(data.accessToken);
    if (userError || !userResult.user) throw new Error("AUTH_REQUIRED");

    const requestBody = buildApprovalRequest({
      invoiceId: document.id,
      invoiceType: TAX_INVOICE_TYPE_CODE,
      issuerVatNumber: issuerVat,
      customerVatNumber: customerVat,
      customerName: client.name,
      invoiceReferenceNumber: String(reservedNumber),
      invoiceDate: document.issue_date,
      issuanceDate: israelDateToday(),
      userName: taxAuthorityUserName(userResult.user.id),
      softwareRegistrationNumber: softwareRegistrationNumber(issuerVat),
      clientSoftwareKey: business.id,
      subtotalBeforeVat: subtotal,
      vatAmount,
    });

    await supabase.rpc("update_tax_authority_request", {
      _request_id: requestRow.id,
      _status: "submitted",
    });

    const endpoint =
      process.env.ISRAEL_INVOICE_API_BASE_URL || ISRAEL_INVOICE_APPROVAL_URL[environment];

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
    const result = parseApprovalResponse(payload);

    if (result.kind !== "approved") {
      const errorCode =
        response.status === 401
          ? "ISRAEL_INVOICE_OAUTH_UNAUTHORIZED"
          : response.status === 403 || response.status === 406
            ? "ALLOCATION_API_FORBIDDEN"
            : result.kind === "not_approved"
              ? `ALLOCATION_NOT_APPROVED_${result.code}`
              : result.code
                ? `ALLOCATION_REQUEST_INVALID_${result.code}`
                : `ALLOCATION_API_ERROR_HTTP_${response.status}`;
      await supabase.rpc("update_tax_authority_request", {
        _request_id: requestRow.id,
        _status: result.kind === "not_approved" ? "rejected" : "failed",
        _response_payload: payload as never,
        _error_code: errorCode,
        _error_message: `Approval V2 returned HTTP ${response.status} without an allocation number`,
      });
      throw new Error(errorCode);
    }

    // The full confirmation number is stored; the invoice prints its last 9 digits.
    const allocationNumber = result.confirmationNumber;

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

const decisionSchema = inputSchema.extend({ decision: z.enum(ALLOCATION_DECISIONS) });

/**
 * Sends the business's decision about an invoice the Tax Authority held
 * (Invoice-decision V1, section 4) and records it on the draft.
 */
export const sendAllocationDecision = createServerFn({ method: "POST" })
  .validator(decisionSchema)
  .handler(async ({ data }) => {
    const supabase = createServerSupabase(data.accessToken);
    const { data: userResult, error: userError } = await supabase.auth.getUser(data.accessToken);
    if (userError || !userResult.user) throw new Error("AUTH_REQUIRED");

    const { data: document, error: documentError } = await supabase
      .from("documents")
      .select("*, businesses:business_id(*)")
      .eq("id", data.documentId)
      .single();
    if (documentError || !document) throw new Error("DOCUMENT_NOT_FOUND");
    if (document.status !== "draft") throw new Error("DOCUMENT_NOT_DRAFT");
    if (document.allocation_decision) throw new Error("ALLOCATION_DECISION_ALREADY_SENT");

    const business = document.businesses as unknown as BusinessRow | null;
    if (!business) throw new Error("DOCUMENT_RELATIONS_NOT_FOUND");

    // Owners and admins decide, as with cancelling an issued document.
    const { data: membership } = await supabase
      .from("business_members")
      .select("role")
      .eq("business_id", document.business_id)
      .eq("user_id", userResult.user.id)
      .maybeSingle();
    if (!membership || !["owner", "admin"].includes(membership.role)) {
      throw new Error("FORBIDDEN");
    }

    // A decision applies only to an invoice the Tax Authority held (460/461).
    const { data: request } = await supabase
      .from("tax_authority_requests")
      .select("status, error_code")
      .eq("document_id", document.id)
      .eq("request_kind", "allocation_number")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (
      request?.status !== "rejected" ||
      !/^ALLOCATION_NOT_APPROVED_46[01]$/.test(request.error_code ?? "")
    ) {
      throw new Error("ALLOCATION_DECISION_NOT_APPLICABLE");
    }

    const environment = israelInvoiceEnvironment();
    const admin = createAdminSupabase();
    const accessTokenForTaxAuthority = await taxAuthorityAccessToken(
      admin,
      document.business_id,
      environment,
    );
    const issuerVat = String(business.tax_id ?? "").trim();
    const requestBody = buildDecisionRequest({
      invoiceId: document.id,
      issuerVatNumber: issuerVat,
      userName: taxAuthorityUserName(userResult.user.id),
      softwareRegistrationNumber: softwareRegistrationNumber(issuerVat),
    });

    let response: Response;
    try {
      response = await fetch(invoiceDecisionUrl(environment, data.decision), {
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
    const result = parseDecisionResponse(response.status, payload);
    if (!result.accepted) {
      if (response.status === 401) throw new Error("ISRAEL_INVOICE_OAUTH_UNAUTHORIZED");
      if (response.status === 403 || response.status === 406) {
        throw new Error("ALLOCATION_API_FORBIDDEN");
      }
      throw new Error(
        result.code
          ? `ALLOCATION_DECISION_REJECTED_${result.code}`
          : `ALLOCATION_API_ERROR_HTTP_${response.status}`,
      );
    }

    // Recorded with the service role: API users cannot set it themselves.
    const { error: updateError } = await admin
      .from("documents")
      .update({
        allocation_decision: data.decision,
        allocation_decision_at: new Date().toISOString(),
      })
      .eq("id", document.id)
      .eq("status", "draft");
    if (updateError) throw updateError;

    await admin.rpc("log_audit", {
      _business_id: document.business_id,
      _action: "document.allocation_decision",
      _entity: "document",
      _entity_id: document.id,
      _payload: { decision: data.decision, user_id: userResult.user.id },
    });

    return { decision: data.decision };
  });
