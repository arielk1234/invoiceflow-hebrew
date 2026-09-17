import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Trash2, Plus, Save, FileCheck2 } from "lucide-react";
import { toast } from "sonner";
import {
  actions,
  money,
  totals,
  uid,
  type Client,
  type Doc,
  type DocType,
} from "@/lib/store";

const field =
  "w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/30";
const labelCls = "mb-1.5 block text-xs font-semibold text-muted-foreground";

export function DocEditor({
  initial,
  clients,
  documents = [],
  onDone,
}: {
  initial: Doc;
  clients: Client[];
  documents?: Doc[];
  onDone?: () => void;
}) {
  const navigate = useNavigate();
  const [doc, setDoc] = useState<Doc>(initial);
  const [saving, setSaving] = useState(false);
  const t = totals(doc);
  const selectedClient = clients.find((c) => c.id === doc.clientId);
  const allocationThreshold = doc.issueDate >= "2026-06-01" ? 5000 : doc.issueDate >= "2026-01-01" ? 10000 : 20000;
  const allocationRelevant =
    doc.type === "invoice" &&
    t.subtotal > allocationThreshold &&
    doc.vatRate > 0 &&
    Boolean(selectedClient?.isVatRegistered);

  const set = <K extends keyof Doc>(key: K, value: Doc[K]) =>
    setDoc((d) => ({ ...d, [key]: value }));

  const setType = (type: DocType) => setDoc((d) => ({ ...d, type, relatedDocumentId: undefined }));

  const updateItem = (id: string, patch: Partial<Doc["items"][number]>) =>
    setDoc((d) => ({
      ...d,
      items: d.items.map((i) => (i.id === id ? { ...i, ...patch } : i)),
    }));

  const save = async (issueAfterSave = false) => {
    if (!doc.clientId) {
      toast.error("יש לבחור לקוח");
      return;
    }
    if (!doc.items.some((i) => i.description.trim())) {
      toast.error("יש להזין לפחות שורת חיוב אחת");
      return;
    }
    if (doc.type === "credit_note" && !doc.relatedDocumentId) {
      toast.error("חשבונית זיכוי חייבת להיות מקושרת למסמך המקורי");
      return;
    }
    setSaving(true);
    try {
      const id = await actions.saveDoc(doc);
      if (issueAfterSave) {
        await actions.issueDoc(id);
        toast.success("המסמך הופק וננעל");
      } else {
        toast.success("המסמך נשמר בענן");
      }
      if (onDone) onDone();
      else navigate({ to: "/documents/$id", params: { id } });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.includes("ALLOCATION_NUMBER_REQUIRED")) {
        toast.error("נדרש מספר הקצאה לפני הפקת החשבונית");
      } else if (message.includes("EXEMPT_BUSINESS_CANNOT_ISSUE_TAX_INVOICE")) {
        toast.error("עוסק פטור אינו יכול להפיק חשבונית מס");
      } else {
        toast.error(issueAfterSave ? "הפקת המסמך נכשלה" : "שמירת המסמך נכשלה");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="mb-5 inline-flex rounded-xl bg-secondary p-1">
          {(["invoice", "receipt", "credit_note"] as const).map((tp) => (
            <button
              key={tp}
              type="button"
              onClick={() => setType(tp)}
              className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${doc.type === tp ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}
            >
              {tp === "invoice" ? "חשבונית מס" : tp === "receipt" ? "קבלה" : "חשבונית זיכוי"}
            </button>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className={labelCls}>מספר מסמך</label>
            <input className={`${field} bg-secondary/60 text-muted-foreground`} value={doc.number || "יוקצה בעת ההפקה"} readOnly disabled />
          </div>
          <div>
            <label className={labelCls}>לקוח</label>
            <select className={field} value={doc.clientId} onChange={(e) => set("clientId", e.target.value)}>
              <option value="">בחירת לקוח…</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>תאריך הפקה</label>
            <input type="date" className={field} value={doc.issueDate} onChange={(e) => set("issueDate", e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>{doc.type === "invoice" ? "תאריך לתשלום" : "תאריך תשלום"}</label>
            <input type="date" className={field} value={doc.dueDate} onChange={(e) => set("dueDate", e.target.value)} />
          </div>
        </div>

        {doc.type === "credit_note" && (
          <div className="mt-4">
            <label className={labelCls}>מסמך מקורי לזיכוי</label>
            <select className={field} value={doc.relatedDocumentId ?? ""} onChange={(e) => set("relatedDocumentId", e.target.value || undefined)}>
              <option value="">בחירת חשבונית מקור…</option>
              {documents.filter((d) => d.type === "invoice" && d.status !== "draft").map((d) => (
                <option key={d.id} value={d.id}>{d.number || d.id}</option>
              ))}
            </select>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h2 className="mb-4 text-base font-bold text-foreground">שורות חיוב</h2>
        <div className="space-y-3">
          {doc.items.map((item) => (
            <div key={item.id} className="grid items-end gap-3 rounded-xl bg-secondary/50 p-3 sm:grid-cols-[1fr_7rem_9rem_8rem_auto]">
              <div><label className={labelCls}>תיאור</label><input className={field} placeholder="לדוגמה: שירות מקצועי" value={item.description} onChange={(e) => updateItem(item.id, { description: e.target.value })} /></div>
              <div><label className={labelCls}>כמות</label><input type="number" min={0} step="0.5" className={field} value={item.quantity} onChange={(e) => updateItem(item.id, { quantity: Number(e.target.value) })} /></div>
              <div><label className={labelCls}>מחיר ליחידה (₪)</label><input type="number" min={0} step="0.01" className={field} value={item.unitPrice} onChange={(e) => updateItem(item.id, { unitPrice: Number(e.target.value) })} /></div>
              <div className="pb-2 text-sm font-semibold text-foreground">{money(item.quantity * item.unitPrice)}</div>
              <button type="button" aria-label="מחיקת שורה" onClick={() => setDoc((d) => ({ ...d, items: d.items.filter((i) => i.id !== item.id) }))} className="mb-1 rounded-lg p-2 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"><Trash2 className="size-4" /></button>
            </div>
          ))}
        </div>

        <button type="button" onClick={() => setDoc((d) => ({ ...d, items: [...d.items, { id: uid(), description: "", quantity: 1, unitPrice: 0 }] }))} className="mt-4 inline-flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-sm font-medium text-muted-foreground transition hover:border-ring hover:text-foreground"><Plus className="size-4" />הוספת שורה</button>

        <div className="mt-6 grid gap-4 border-t border-border pt-5 sm:grid-cols-2">
          <div className="space-y-4">
            <div><label className={labelCls}>שיעור מע״מ (%)</label><input type="number" min={0} step="0.5" className={`${field} max-w-32`} value={doc.vatRate} onChange={(e) => set("vatRate", Number(e.target.value))} /></div>
            {doc.type === "receipt" && <div><label className={labelCls}>אמצעי תשלום</label><input className={field} placeholder="העברה בנקאית / אשראי / מזומן" value={doc.paymentMethod ?? ""} onChange={(e) => set("paymentMethod", e.target.value)} /></div>}
            {doc.type === "invoice" && allocationRelevant && (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                <label className="flex items-start gap-3 text-sm font-medium text-foreground">
                  <input type="checkbox" className="mt-1" checked={doc.allocationRequested} onChange={(e) => set("allocationRequested", e.target.checked)} />
                  <span>הלקוח ביקש מספר הקצאה לחשבונית זו</span>
                </label>
                {doc.allocationRequested && <div className="mt-3"><label className={labelCls}>מספר הקצאה שהתקבל מרשות המסים</label><input className={field} inputMode="numeric" maxLength={9} value={doc.allocationNumber ?? ""} onChange={(e) => set("allocationNumber", e.target.value.replace(/\D/g, ""))} placeholder="9 ספרות" /></div>}
                <p className="mt-2 text-xs text-muted-foreground">לפי כללי 2026, הסף הוא מעל {allocationThreshold.toLocaleString("he-IL")} ₪ לפני מע״מ, כאשר מתקיימים התנאים הרלוונטיים. חיבור API לרשות המסים יתווסף בשלב האינטגרציה.</p>
              </div>
            )}
            <div><label className={labelCls}>הערות</label><textarea rows={3} className={field} value={doc.notes ?? ""} onChange={(e) => set("notes", e.target.value)} /></div>
          </div>

          <div className="space-y-2 rounded-xl bg-secondary/60 p-4 text-sm">
            <div className="flex justify-between text-muted-foreground"><span>סכום ביניים</span><span className="font-medium text-foreground">{money(t.subtotal)}</span></div>
            <div className="flex justify-between text-muted-foreground"><span>מע״מ {doc.vatRate}%</span><span className="font-medium text-foreground">{money(t.vat)}</span></div>
            <div className="flex justify-between border-t border-border pt-2 text-base font-bold text-foreground"><span>סה״כ לתשלום</span><span>{money(t.total)}</span></div>
          </div>
        </div>
      </section>

      <div className="flex flex-wrap justify-start gap-3">
        <button disabled={saving} onClick={() => void save(false)} className="inline-flex items-center gap-2 rounded-lg border border-input px-5 py-2.5 text-sm font-semibold text-foreground transition hover:bg-secondary disabled:opacity-50"><Save className="size-4" />שמירת טיוטה</button>
        <button disabled={saving} onClick={() => void save(true)} className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"><FileCheck2 className="size-4" />שמירה והפקה</button>
      </div>
    </div>
  );
}
