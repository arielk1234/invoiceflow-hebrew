import { useEffect, useState } from "react";

export type DocType = "invoice" | "receipt" | "creditNote";
export type DocStatus = "draft" | "issued" | "sent" | "paid" | "cancelled";
export type BusinessType = "exempt" | "licensed" | "company" | "partnership";

export type Client = {
  id: string;
  name: string;
  taxId?: string;
  email?: string;
  phone?: string;
  address?: string;
};

export type LineItem = {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
};

export type BusinessInfo = {
  name: string;
  taxId: string;
  address: string;
  phone: string;
  email: string;
  businessType: BusinessType;
  vatRate: number;
  documentPrefix: string;
};

export type AuditEvent = {
  id: string;
  docId: string;
  action: "created" | "issued" | "sent" | "paid" | "cancelled";
  at: string;
  documentHash: string;
  note?: string;
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
  createdAt: string;
  issuedAt?: string;
  cancelledAt?: string;
  cancellationReason?: string;
  relatedDocId?: string;
  allocationNumber?: string;
  documentHash?: string;
};

export type AppData = {
  business: BusinessInfo;
  clients: Client[];
  docs: Doc[];
  audit: AuditEvent[];
};

const KEY = "hesbonit-data-v2";
const LEGACY_KEY = "hesbonit-data-v1";

export const uid = () => crypto.randomUUID?.() ?? Math.random().toString(36).slice(2, 12);

const nowIso = () => new Date().toISOString();
const today = () => new Date().toISOString().slice(0, 10);
const plusDays = (n: number) =>
  new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

function normalizeLegacy(raw: unknown): AppData {
  const legacy = raw as Partial<AppData>;
  const business = legacy.business ?? {
    name: "",
    taxId: "",
    address: "",
    phone: "",
    email: "",
  };
  const docs = (legacy.docs ?? []).map((d) => ({
    ...d,
    status: d.status === "draft" ? "draft" : d.status === "paid" ? "paid" : "issued",
    createdAt: d.createdAt ?? nowIso(),
  })) as Doc[];
  return {
    business: {
      ...business,
      businessType: business.businessType ?? "licensed",
      vatRate: business.vatRate ?? 18,
      documentPrefix: business.documentPrefix ?? "INV",
    },
    clients: legacy.clients ?? [],
    docs,
    audit: legacy.audit ?? [],
  };
}

function seed(): AppData {
  const c1: Client = {
    id: uid(),
    name: "סטודיו אלמוג עיצוב",
    taxId: "514789632",
    email: "hello@almog-studio.co.il",
    phone: "03-5551234",
    address: "הרצל 45, תל אביב",
  };
  const c2: Client = {
    id: uid(),
    name: "כרמל טכנולוגיות בע״מ",
    taxId: "512336987",
    email: "finance@carmel-tech.co.il",
    phone: "04-8221100",
    address: "שדרות המגינים 12, חיפה",
  };
  const c3: Client = {
    id: uid(),
    name: "נועה בן־דוד",
    email: "noa.bd@gmail.com",
    phone: "052-7788990",
    address: "אלנבי 8, ירושלים",
  };
  const created = nowIso();
  return {
    business: {
      name: "אולפני יערה — ייעוץ ועיצוב",
      taxId: "039112477",
      address: "רחוב ביאליק 22, רמת גן",
      phone: "054-1234567",
      email: "yaara@studio.co.il",
      businessType: "licensed",
      vatRate: 18,
      documentPrefix: "INV",
    },
    clients: [c1, c2, c3],
    docs: [
      {
        id: uid(),
        type: "invoice",
        number: "2026-001",
        clientId: c1.id,
        issueDate: plusDays(-21),
        dueDate: plusDays(9),
        vatRate: 18,
        status: "sent",
        createdAt: created,
        issuedAt: created,
        items: [
          { id: uid(), description: "עיצוב זהות מותג", quantity: 1, unitPrice: 8500 },
          { id: uid(), description: "שעות ייעוץ", quantity: 6, unitPrice: 420 },
        ],
        notes: "תנאי תשלום: שוטף + 30",
      },
      {
        id: uid(),
        type: "invoice",
        number: "2026-002",
        clientId: c2.id,
        issueDate: plusDays(-8),
        dueDate: plusDays(22),
        vatRate: 18,
        status: "draft",
        createdAt: created,
        items: [{ id: uid(), description: "אפיון ממשק משתמש", quantity: 1, unitPrice: 12400 }],
      },
      {
        id: uid(),
        type: "receipt",
        number: "K-2026-001",
        clientId: c3.id,
        issueDate: plusDays(-3),
        dueDate: plusDays(-3),
        vatRate: 18,
        status: "paid",
        paymentMethod: "העברה בנקאית",
        createdAt: created,
        issuedAt: created,
        items: [{ id: uid(), description: "סדנת צילום", quantity: 2, unitPrice: 650 }],
      },
    ],
    audit: [],
  };
}

let data: AppData | null = null;
const listeners = new Set<() => void>();

function load(): AppData {
  if (data) return data;
  if (typeof window === "undefined") return seed();
  try {
    const raw = window.localStorage.getItem(KEY) ?? window.localStorage.getItem(LEGACY_KEY);
    data = raw ? normalizeLegacy(JSON.parse(raw)) : seed();
  } catch {
    data = seed();
  }
  return data;
}

function commit(next: AppData) {
  data = next;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  }
  listeners.forEach((l) => l());
}

export function useData() {
  const [state, setState] = useState<AppData | null>(null);
  useEffect(() => {
    const sync = () => setState({ ...load() });
    sync();
    listeners.add(sync);
    return () => listeners.delete(sync);
  }, []);
  return state;
}

export const actions = {
  saveBusiness(business: BusinessInfo) {
    commit({ ...load(), business });
  },
  saveClient(client: Client) {
    const d = load();
    const exists = d.clients.some((c) => c.id === client.id);
    commit({ ...d, clients: exists ? d.clients.map((c) => (c.id === client.id ? client : c)) : [...d.clients, client] });
  },
  deleteClient(id: string) {
    const d = load();
    commit({ ...d, clients: d.clients.filter((c) => c.id !== id) });
  },
  saveDoc(doc: Doc) {
    const d = load();
    const existing = d.docs.find((x) => x.id === doc.id);
    if (existing?.status !== "draft") {
      throw new Error("לא ניתן לערוך מסמך שהופק. יש להפיק מסמך זיכוי במקרה של תיקון.");
    }
    const normalized = { ...doc, createdAt: existing?.createdAt ?? doc.createdAt ?? nowIso() };
    const exists = Boolean(existing);
    commit({ ...d, docs: exists ? d.docs.map((x) => (x.id === doc.id ? normalized : x)) : [normalized, ...d.docs] });
  },
  issueDoc(id: string) {
    const d = load();
    const doc = d.docs.find((x) => x.id === id);
    if (!doc) throw new Error("המסמך לא נמצא");
    if (doc.status !== "draft") throw new Error("המסמך כבר הופק ואינו ניתן להפקה מחדש");
    if (!doc.clientId || !doc.items.some((i) => i.description.trim())) throw new Error("יש להשלים לקוח ושורת חיוב לפני הפקה");
    const issuedAt = nowIso();
    const hash = documentHash(doc);
    const issued = { ...doc, status: "issued" as const, issuedAt, documentHash: hash };
    commit({
      ...d,
      docs: d.docs.map((x) => (x.id === id ? issued : x)),
      audit: [...d.audit, { id: uid(), docId: id, action: "issued", at: issuedAt, documentHash: hash }],
    });
  },
  setStatus(id: string, status: Exclude<DocStatus, "draft" | "cancelled">) {
    const d = load();
    const doc = d.docs.find((x) => x.id === id);
    if (!doc || doc.status === "draft" || doc.status === "cancelled") return;
    const at = nowIso();
    const hash = doc.documentHash ?? documentHash(doc);
    commit({ ...d, docs: d.docs.map((x) => (x.id === id ? { ...x, status } : x)), audit: [...d.audit, { id: uid(), docId: id, action: status, at, documentHash: hash }] });
  },
  cancelDoc(id: string, reason: string) {
    const d = load();
    const doc = d.docs.find((x) => x.id === id);
    if (!doc || doc.status === "draft" || doc.status === "cancelled") throw new Error("לא ניתן לבטל את המסמך במצב הנוכחי");
    const at = nowIso();
    const hash = doc.documentHash ?? documentHash(doc);
    const cancelled = { ...doc, status: "cancelled" as const, cancelledAt: at, cancellationReason: reason.trim() || "ביטול מסמך" };
    commit({ ...d, docs: d.docs.map((x) => (x.id === id ? cancelled : x)), audit: [...d.audit, { id: uid(), docId: id, action: "cancelled", at, documentHash: hash, note: cancelled.cancellationReason }] });
  },
  deleteDoc(id: string) {
    const d = load();
    const doc = d.docs.find((x) => x.id === id);
    if (doc && doc.status !== "draft") throw new Error("מסמך שהופק אינו ניתן למחיקה. יש לבטל אותו או להפיק זיכוי.");
    commit({ ...d, docs: d.docs.filter((x) => x.id !== id) });
  },
};

export function nextNumber(type: DocType, docs: Doc[]) {
  const year = new Date().getFullYear();
  const prefix = type === "receipt" ? `K-${year}-` : type === "creditNote" ? `CN-${year}-` : `${year}-`;
  const nums = docs.filter((d) => d.type === type && d.number.startsWith(prefix)).map((d) => parseInt(d.number.slice(prefix.length), 10)).filter((n) => !Number.isNaN(n));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `${prefix}${String(next).padStart(3, "0")}`;
}

export function emptyDoc(type: DocType, docs: Doc[]): Doc {
  return {
    id: uid(), type, number: nextNumber(type, docs), clientId: "", issueDate: today(), dueDate: plusDays(30),
    items: [{ id: uid(), description: "", quantity: 1, unitPrice: 0 }], vatRate: 18, status: "draft", createdAt: nowIso(),
  };
}

export function totals(doc: Pick<Doc, "items" | "vatRate">) {
  const subtotal = doc.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const vat = (subtotal * doc.vatRate) / 100;
  return { subtotal, vat, total: subtotal + vat };
}

export const money = (n: number) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 2 }).format(n || 0);
export const dateHe = (iso: string) => iso ? new Intl.DateTimeFormat("he-IL").format(new Date(iso)) : "";

export function documentHash(doc: Pick<Doc, "id" | "type" | "number" | "clientId" | "issueDate" | "items" | "vatRate">) {
  const canonical = JSON.stringify({ id: doc.id, type: doc.type, number: doc.number, clientId: doc.clientId, issueDate: doc.issueDate, items: doc.items, vatRate: doc.vatRate });
  let hash = 2166136261;
  for (let i = 0; i < canonical.length; i++) hash = Math.imul(hash ^ canonical.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function requiresAllocationNumber(doc: Pick<Doc, "type" | "status" | "vatRate" | "items">) {
  if (doc.type !== "invoice" || doc.status === "draft" || doc.vatRate <= 0) return false;
  const subtotal = doc.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  return subtotal > 5000;
}

export const statusLabel: Record<DocStatus, string> = { draft: "טיוטה", issued: "הופק", sent: "נשלח", paid: "שולם", cancelled: "מבוטל" };
export const typeLabel: Record<DocType, string> = { invoice: "חשבונית מס", receipt: "קבלה", creditNote: "חשבונית זיכוי" };
