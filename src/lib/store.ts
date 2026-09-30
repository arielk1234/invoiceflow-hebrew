import { useEffect, useState } from "react";
import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { requestIsraelAllocation, sendAllocationDecision } from "./israel-invoice-functions";
import { ALLOCATION_DECISIONS, type AllocationDecision } from "./israel-invoice-api";

export type DocType = "invoice" | "receipt" | "credit_note";
export type DocStatus = "draft" | "issued" | "sent" | "paid" | "cancelled";
export type BusinessRole = "owner" | "admin" | "user";
export type Client = {
  id: string;
  name: string;
  taxId?: string;
  email?: string;
  phone?: string;
  address?: string;
  isVatRegistered: boolean;
};
export type LineItem = {
  id: string;
  description: string;
  /** The unit the quantity is measured in (section 9 of the bookkeeping instructions). */
  unit: string;
  quantity: number;
  unitPrice: number;
};
export const DEFAULT_UNIT = "יחידה";
export type BusinessInfo = {
  id: string;
  name: string;
  taxId: string;
  address: string;
  phone: string;
  email: string;
  documentPrefix: string;
  businessType: "osek_patur" | "osek_murshe" | "company";
  vatRate: number;
};
export type Doc = {
  id: string;
  type: DocType;
  number: string;
  clientId: string;
  issueDate: string;
  dueDate: string;
  items: LineItem[];
  vatRate: number;
  status: DocStatus;
  notes?: string;
  paymentMethod?: string;
  /** Cheque details, required when a receipt is paid by cheque (Uniform Format D120). */
  chequeBank?: string;
  chequeBranch?: string;
  chequeAccount?: string;
  chequeNumber?: string;
  relatedDocumentId?: string;
  /** Why a credit note changes the invoice (required on issue). */
  creditReason?: string;
  /** Printed copies so far: the first is "מקור", the rest "העתק". */
  printCount?: number;
  allocationRequested: boolean;
  allocationNumber?: string;
  allocationRequestedAt?: string;
  /** Tax Authority error code (460/461/462) when it held this invoice. */
  allocationHoldCode?: number;
  allocationDecision?: AllocationDecision;
  subtotal?: number;
  vatAmount?: number;
  totalAmount?: number;
  contentHash?: string;
  /** When the server issued the document (Uniform Format field 1205). */
  issuedAt?: string;
};
export type AppData = {
  business: BusinessInfo;
  businessId: string;
  role: BusinessRole;
  clients: Client[];
  docs: Doc[];
};
export const uid = () => Math.random().toString(36).slice(2, 10);
const today = () => new Date().toISOString().slice(0, 10);
const plusDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
let cache: AppData | null = null;
let inflight: Promise<AppData | null> | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
type UnknownRecord = Record<string, unknown>;
async function resolveActiveBusiness(userId: string) {
  const { data: memberships, error } = await supabase
    .from("business_members")
    .select("business_id, role")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  if (memberships && memberships.length) {
    const stored =
      typeof window !== "undefined" ? window.localStorage.getItem("active-business") : null;
    const chosen = memberships.find((m) => m.business_id === stored) ?? memberships[0]!;
    return { businessId: chosen.business_id, role: chosen.role as BusinessRole };
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("business_name, tax_id, business_type, email")
    .eq("id", userId)
    .maybeSingle();
  const { data: newId, error: rpcError } = await supabase.rpc("create_business", {
    _name: profile?.business_name || "העסק שלי",
    _tax_id: profile?.tax_id ?? "",
    _business_type: profile?.business_type ?? "osek_patur",
    _email: profile?.email ?? "",
  });
  if (rpcError) throw rpcError;
  return { businessId: newId as string, role: "owner" as BusinessRole };
}
const DOCUMENT_COLUMNS =
  "*, document_items(*), tax_authority_requests(request_kind, status, error_code, updated_at)";

/** Reads every page of a query: the API returns at most 1,000 rows per request. */
async function allPages<T>(
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>,
): Promise<{ data: T[] | null; error: PostgrestError | null }> {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error) return { data: null, error };
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) return { data: rows, error: null };
  }
}

async function fetchAll(): Promise<AppData | null> {
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) return null;
  const { businessId, role } = await resolveActiveBusiness(user.id);
  const [businessRes, clientsRes, docsWithRequests] = await Promise.all([
    supabase.from("businesses").select("*").eq("id", businessId).single(),
    allPages((from, to) =>
      supabase
        .from("clients")
        .select("*")
        .eq("business_id", businessId)
        .order("created_at", { ascending: true })
        .order("id")
        .range(from, to),
    ),
    allPages((from, to) =>
      supabase
        .from("documents")
        .select(DOCUMENT_COLUMNS)
        .eq("business_id", businessId)
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to),
    ),
  ]);
  // Until the Tax Authority migrations run, tax_authority_requests does not exist;
  // keep the app usable without the hold status.
  const docsRes = docsWithRequests.error?.message.includes("schema cache")
    ? ((await allPages((from, to) =>
        supabase
          .from("documents")
          .select("*, document_items(*)")
          .eq("business_id", businessId)
          .order("created_at", { ascending: false })
          .order("id")
          .range(from, to),
      )) as unknown as typeof docsWithRequests)
    : docsWithRequests;
  if (businessRes.error) throw businessRes.error;
  if (clientsRes.error) throw clientsRes.error;
  if (docsRes.error) throw docsRes.error;
  const b = businessRes.data;
  return {
    businessId,
    role,
    business: {
      id: b.id,
      name: b.name,
      taxId: b.tax_id,
      address: b.address,
      phone: b.phone,
      email: b.email,
      documentPrefix: b.document_prefix,
      businessType: b.business_type,
      vatRate: Number(b.vat_rate ?? 18),
    },
    clients: (clientsRes.data ?? []).map((c) => {
      const row = c as UnknownRecord;
      return {
        id: c.id,
        name: c.name,
        taxId: c.tax_id,
        email: c.email,
        phone: c.phone,
        address: c.address,
        isVatRegistered: Boolean(row.is_vat_registered),
      };
    }),
    docs: (docsRes.data ?? []).map((d) => {
      const row = d as UnknownRecord;
      return {
        id: d.id,
        type: d.type as DocType,
        number: d.number,
        clientId: d.client_id,
        issueDate: d.issue_date,
        dueDate: d.due_date,
        vatRate: Number(d.vat_rate),
        status: d.status as DocStatus,
        notes: d.notes,
        paymentMethod: d.payment_method,
        chequeBank: d.cheque_bank ?? undefined,
        chequeBranch: d.cheque_branch ?? undefined,
        chequeAccount: d.cheque_account ?? undefined,
        chequeNumber: d.cheque_number ?? undefined,
        relatedDocumentId:
          typeof row.related_document_id === "string" ? row.related_document_id : undefined,
        creditReason: typeof row.credit_reason === "string" ? row.credit_reason : undefined,
        printCount: typeof row.print_count === "number" ? row.print_count : 0,
        allocationRequested: Boolean(row.allocation_requested),
        allocationNumber:
          typeof row.allocation_number === "string" ? row.allocation_number : undefined,
        allocationRequestedAt:
          typeof row.allocation_requested_at === "string" ? row.allocation_requested_at : undefined,
        allocationHoldCode: allocationHoldCode(d.tax_authority_requests ?? []),
        allocationDecision: ALLOCATION_DECISIONS.find((x) => x === row.allocation_decision),
        subtotal: typeof row.subtotal === "number" ? row.subtotal : undefined,
        vatAmount: typeof row.vat_amount === "number" ? row.vat_amount : undefined,
        totalAmount: typeof row.total_amount === "number" ? row.total_amount : undefined,
        contentHash: typeof row.content_hash === "string" ? row.content_hash : undefined,
        issuedAt: d.issued_at ?? undefined,
        items: [...((d.document_items ?? []) as Array<Record<string, unknown>>)]
          .sort((x, y) => Number(x.position) - Number(y.position))
          .map((i) => ({
            id: String(i.id),
            description: String(i.description ?? ""),
            quantity: Number(i.quantity),
            unitPrice: Number(i.unit_price),
            unit: typeof i.unit === "string" && i.unit.trim() ? i.unit : DEFAULT_UNIT,
          })),
      };
    }),
  };
}
/** Error code of the latest allocation request, when the Tax Authority held the invoice. */
function allocationHoldCode(
  requests: Array<{
    request_kind: string;
    status: string;
    error_code: string | null;
    updated_at: string;
  }>,
): number | undefined {
  const latest = requests
    .filter((r) => r.request_kind === "allocation_number")
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
  if (latest?.status !== "rejected") return undefined;
  const match = /^ALLOCATION_NOT_APPROVED_(46[012])$/.exec(latest.error_code ?? "");
  return match ? Number(match[1]) : undefined;
}
export async function refresh() {
  if (!inflight) {
    inflight = fetchAll().finally(() => {
      inflight = null;
    });
  }
  cache = await inflight;
  notify();
  return cache;
}
export function useData() {
  const [state, setState] = useState<AppData | null>(cache);
  useEffect(() => {
    const sync = () => setState(cache ? { ...cache } : null);
    listeners.add(sync);
    void refresh();
    return () => {
      listeners.delete(sync);
    };
  }, []);
  return state;
}
function requireBusiness() {
  if (!cache) throw new Error("NO_ACTIVE_BUSINESS");
  return cache.businessId;
}
export async function currentAccessToken() {
  const { data: sessionRes, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const accessToken = sessionRes.session?.access_token;
  if (!accessToken) throw new Error("AUTH_SESSION_REQUIRED");
  return accessToken;
}
export const actions = {
  async saveBusiness(business: BusinessInfo) {
    const businessId = requireBusiness();
    const { error } = await supabase
      .from("businesses")
      .update({
        name: business.name,
        tax_id: business.taxId,
        address: business.address,
        phone: business.phone,
        email: business.email,
        document_prefix: business.documentPrefix ?? "",
        business_type: business.businessType,
        vat_rate: business.vatRate,
      })
      .eq("id", businessId);
    if (error) throw error;
    await refresh();
  },
  async saveClient(client: Client) {
    const business_id = requireBusiness();
    const payload = {
      business_id,
      name: client.name,
      tax_id: client.taxId ?? "",
      email: client.email ?? "",
      phone: client.phone ?? "",
      address: client.address ?? "",
      is_vat_registered: client.isVatRegistered,
    };
    const exists = cache?.clients.some((c) => c.id === client.id);
    const query = exists
      ? supabase
          .from("clients")
          .update(payload as never)
          .eq("id", client.id)
      : supabase.from("clients").insert(payload as never);
    const { error } = await query;
    if (error) throw error;
    await refresh();
  },
  async deleteClient(id: string) {
    const { error } = await supabase.from("clients").delete().eq("id", id);
    if (error) throw error;
    await refresh();
  },
  async saveDoc(doc: Doc): Promise<string> {
    const business_id = requireBusiness();
    const base = {
      business_id,
      client_id: doc.clientId,
      type: doc.type,
      issue_date: doc.issueDate,
      due_date: doc.dueDate,
      vat_rate: doc.vatRate,
      notes: doc.notes ?? "",
      payment_method: doc.paymentMethod ?? "",
      cheque_bank: doc.chequeBank ?? null,
      cheque_branch: doc.chequeBranch ?? null,
      cheque_account: doc.chequeAccount ?? null,
      cheque_number: doc.chequeNumber ?? null,
      related_document_id: doc.relatedDocumentId ?? null,
      credit_reason: doc.creditReason?.trim() || null,
      allocation_requested: doc.allocationRequested,
      allocation_number: doc.allocationNumber ?? null,
      allocation_requested_at: doc.allocationRequested
        ? (doc.allocationRequestedAt ?? new Date().toISOString())
        : null,
    };
    const exists = Boolean(doc.id) && cache?.docs.some((d) => d.id === doc.id);
    let docId = doc.id;
    if (exists) {
      const { error } = await supabase
        .from("documents")
        .update(base as never)
        .eq("id", doc.id);
      if (error) throw error;
      const { error: delErr } = await supabase
        .from("document_items")
        .delete()
        .eq("document_id", doc.id);
      if (delErr) throw delErr;
    } else {
      const { data, error } = await supabase
        .from("documents")
        .insert(base as never)
        .select("id")
        .single();
      if (error) throw error;
      docId = data.id;
    }
    const items = doc.items
      .filter((i) => i.description.trim())
      .map((i, index) => ({
        document_id: docId,
        description: i.description,
        quantity: i.quantity,
        unit_price: i.unitPrice,
        unit: i.unit.trim() || DEFAULT_UNIT,
        position: index,
      }));
    if (items.length) {
      const { error } = await supabase.from("document_items").insert(items);
      if (error) throw error;
    }
    await refresh();
    return docId;
  },
  async issueDoc(id: string) {
    // Refresh even on failure: a held invoice shows the decision options.
    try {
      const accessToken = await currentAccessToken();
      await requestIsraelAllocation({ data: { documentId: id, accessToken } });
      const { error } = await supabase.rpc("issue_document", { _document_id: id });
      if (error) throw error;
    } finally {
      await refresh();
    }
  },
  /**
   * Records a print of an issued document and returns its marking: "מקור" for
   * the first copy and "העתק" for every other (appendix H (a)(4)).
   */
  async recordPrint(id: string): Promise<"מקור" | "העתק"> {
    const { data, error } = await supabase.rpc("record_document_print", { _document_id: id });
    if (error) throw error;
    await refresh();
    return data === "מקור" ? "מקור" : "העתק";
  },
  /** "continue" and "cancel" issue the invoice right away; "further_objection" keeps the draft. */
  async decideHeldInvoice(id: string, decision: AllocationDecision) {
    const accessToken = await currentAccessToken();
    await sendAllocationDecision({ data: { documentId: id, accessToken, decision } });
    if (decision === "further_objection") await refresh();
    else await actions.issueDoc(id);
  },
  async deleteDoc(id: string) {
    const doc = cache?.docs.find((d) => d.id === id);
    if (doc && doc.status !== "draft") throw new Error("ISSUED_DOCUMENT_CANNOT_BE_DELETED");
    const { error } = await supabase.from("documents").delete().eq("id", id);
    if (error) throw error;
    await refresh();
  },
  async cancelDoc(id: string, reason = "") {
    const { error } = await supabase.rpc("cancel_document", { _document_id: id, _reason: reason });
    if (error) throw error;
    await refresh();
  },
  async setStatus(id: string, status: DocStatus) {
    if (status === "cancelled") return actions.cancelDoc(id);
    if (!["sent", "paid"].includes(status)) throw new Error("INVALID_STATUS_TRANSITION");
    const { error } = await supabase.from("documents").update({ status }).eq("id", id);
    if (error) throw error;
    await refresh();
  },
};
export function emptyDoc(type: DocType, vatRate = 18): Doc {
  return {
    id: "",
    type,
    number: "",
    clientId: "",
    issueDate: today(),
    dueDate: plusDays(30),
    items: [{ id: uid(), description: "", unit: DEFAULT_UNIT, quantity: 1, unitPrice: 0 }],
    vatRate,
    status: "draft",
    allocationRequested: false,
  };
}
export const isExemptBusiness = (business: Pick<BusinessInfo, "businessType">) =>
  business.businessType === "osek_patur";
export function newDocFor(business: BusinessInfo): Doc {
  return isExemptBusiness(business)
    ? emptyDoc("receipt", 0)
    : emptyDoc("invoice", business.vatRate);
}
export function totals(doc: Pick<Doc, "items" | "vatRate">) {
  const subtotal = doc.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const vat = (subtotal * doc.vatRate) / 100;
  return { subtotal, vat, total: subtotal + vat };
}
export const money = (n: number) =>
  new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 2,
  }).format(n || 0);
export const dateHe = (iso: string) =>
  iso ? new Intl.DateTimeFormat("he-IL").format(new Date(iso)) : "";
export const statusLabel: Record<DocStatus, string> = {
  draft: "טיוטה",
  issued: "הופק",
  sent: "נשלח",
  paid: "שולם",
  cancelled: "מבוטל",
};
export const typeLabel: Record<DocType, string> = {
  invoice: "חשבונית מס",
  receipt: "קבלה",
  credit_note: "חשבונית זיכוי",
};
export const isLocked = (doc: Pick<Doc, "status">) => doc.status !== "draft";
/** Receipt payment methods; they map to the Uniform Format codes (field 1306). */
export const PAYMENT_METHODS = [
  "מזומן",
  "המחאה",
  "כרטיס אשראי",
  "העברה בנקאית",
  "הוראת קבע",
  "אחר",
];
export const CHEQUE = "המחאה";
export const chequeDetailsMissing = (doc: Doc) =>
  doc.type === "receipt" &&
  doc.paymentMethod === CHEQUE &&
  !(
    /^\d{1,10}$/.test(doc.chequeBank ?? "") &&
    /^\d{1,10}$/.test(doc.chequeBranch ?? "") &&
    /^\d{1,15}$/.test(doc.chequeAccount ?? "") &&
    /^\d{1,10}$/.test(doc.chequeNumber ?? "")
  );
