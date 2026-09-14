import { useEffect, useState } from "react";

export type DocType = "invoice" | "receipt";
export type DocStatus = "draft" | "sent" | "paid";

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
};

export type AppData = {
  business: BusinessInfo;
  clients: Client[];
  docs: Doc[];
};

const KEY = "hesbonit-data-v1";

export const uid = () => Math.random().toString(36).slice(2, 10);

const today = () => new Date().toISOString().slice(0, 10);
const plusDays = (n: number) =>
  new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

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
  return {
    business: {
      name: "אולפני יערה — ייעוץ ועיצוב",
      taxId: "039112477",
      address: "רחוב ביאליק 22, רמת גן",
      phone: "054-1234567",
      email: "yaara@studio.co.il",
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
        items: [
          { id: uid(), description: "אפיון ממשק משתמש", quantity: 1, unitPrice: 12400 },
        ],
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
        items: [{ id: uid(), description: "סדנת צילום", quantity: 2, unitPrice: 650 }],
      },
    ],
  };
}

let data: AppData | null = null;
const listeners = new Set<() => void>();

function load(): AppData {
  if (data) return data;
  if (typeof window === "undefined") return seed();
  try {
    const raw = window.localStorage.getItem(KEY);
    data = raw ? (JSON.parse(raw) as AppData) : seed();
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
    return () => {
      listeners.delete(sync);
    };
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
    commit({
      ...d,
      clients: exists
        ? d.clients.map((c) => (c.id === client.id ? client : c))
        : [...d.clients, client],
    });
  },
  deleteClient(id: string) {
    const d = load();
    commit({ ...d, clients: d.clients.filter((c) => c.id !== id) });
  },
  saveDoc(doc: Doc) {
    const d = load();
    const exists = d.docs.some((x) => x.id === doc.id);
    commit({
      ...d,
      docs: exists ? d.docs.map((x) => (x.id === doc.id ? doc : x)) : [doc, ...d.docs],
    });
  },
  deleteDoc(id: string) {
    const d = load();
    commit({ ...d, docs: d.docs.filter((x) => x.id !== id) });
  },
  setStatus(id: string, status: DocStatus) {
    const d = load();
    commit({ ...d, docs: d.docs.map((x) => (x.id === id ? { ...x, status } : x)) });
  },
};

export function nextNumber(type: DocType, docs: Doc[]) {
  const year = new Date().getFullYear();
  const prefix = type === "invoice" ? `${year}-` : `K-${year}-`;
  const nums = docs
    .filter((d) => d.type === type && d.number.startsWith(prefix))
    .map((d) => parseInt(d.number.slice(prefix.length), 10))
    .filter((n) => !Number.isNaN(n));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `${prefix}${String(next).padStart(3, "0")}`;
}

export function emptyDoc(type: DocType, docs: Doc[]): Doc {
  return {
    id: uid(),
    type,
    number: nextNumber(type, docs),
    clientId: "",
    issueDate: today(),
    dueDate: plusDays(30),
    items: [{ id: uid(), description: "", quantity: 1, unitPrice: 0 }],
    vatRate: 18,
    status: "draft",
  };
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
  sent: "נשלח",
  paid: "שולם",
};

export const typeLabel: Record<DocType, string> = {
  invoice: "חשבונית",
  receipt: "קבלה",
};
