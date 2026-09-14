import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Trash2, Plus, Save, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { actions, money, nextNumber, totals, uid, type Client, type Doc, type DocType } from "@/lib/store";

const field = "w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/30";
const labelCls = "mb-1.5 block text-xs font-semibold text-muted-foreground";

export function DocEditor({ initial, clients, allDocs, onDone }: { initial: Doc; clients: Client[]; allDocs: Doc[]; onDone?: () => void }) {
  const navigate = useNavigate();
  const [doc, setDoc] = useState<Doc>(initial);
  const t = totals(doc);
  const editable = doc.status === "draft";

  const set = <K extends keyof Doc>(key: K, value: Doc[K]) => setDoc((d) => ({ ...d, [key]: value }));
  const setType = (type: DocType) => setDoc((d) => ({ ...d, type, number: nextNumber(type, allDocs) }));
  const updateItem = (id: string, patch: Partial<Doc["items"][number]>) => setDoc((d) => ({ ...d, items: d.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) }));

  const save = () => {
    if (!editable) return;
    if (!doc.clientId) return void toast.error("יש לבחור לקוח");
    if (!doc.items.some((i) => i.description.trim())) return void toast.error("יש להזין לפחות שורת חיוב אחת");
    if (doc.items.some((i) => i.quantity <= 0 || i.unitPrice < 0)) return void toast.error("כמות חייבת להיות גדולה מאפס והמחיר לא יכול להיות שלילי");
    try {
      actions.saveDoc(doc);
      toast.success("הטיוטה נשמרה");
      if (onDone) onDone(); else navigate({ to: "/documents/$id", params: { id: doc.id } });
    } catch (e) { toast.error(e instanceof Error ? e.message : "לא ניתן לשמור את המסמך"); }
  };

  return (
    <div className="space-y-6">
      {!editable && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-300/50 bg-amber-50 p-4 text-sm text-amber-900">
          <ShieldCheck className="mt-0.5 size-5 shrink-0" />
          <div><p className="font-bold">המסמך נעול</p><p className="mt-1">מסמך שהופק אינו ניתן לעריכה. במקרה של טעות יש להשתמש בביטול/זיכוי וליצור מסמך חדש.</p></div>
        </div>
      )}

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="mb-5 inline-flex rounded-xl bg-secondary p-1">
          {(["invoice", "receipt", "creditNote"] as const).map((tp) => (
            <button key={tp} type="button" disabled={!editable} onClick={() => setType(tp)} className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${doc.type === tp ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>
              {tp === "invoice" ? "חשבונית מס" : tp === "receipt" ? "קבלה" : "חשבונית זיכוי"}
            </button>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div><label className={labelCls}>מספר מסמך</label><input className={field} disabled value={doc.number} /></div>
          <div><label className={labelCls}>לקוח</label><select className={field} disabled={!editable} value={doc.clientId} onChange={(e) => set("clientId", e.target.value)}><option value="">בחירת לקוח…</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div><label className={labelCls}>תאריך הפקה</label><input type="date" className={field} disabled={!editable} value={doc.issueDate} onChange={(e) => set("issueDate", e.target.value)} /></div>
          <div><label className={labelCls}>{doc.type === "invoice" ? "תאריך לתשלום" : "תאריך תשלום"}</label><input type="date" className={field} disabled={!editable} value={doc.dueDate} onChange={(e) => set("dueDate", e.target.value)} /></div>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h2 className="mb-4 text-base font-bold text-foreground">שורות חיוב</h2>
        <div className="space-y-3">
          {doc.items.map((item) => <div key={item.id} className="grid items-end gap-3 rounded-xl bg-secondary/50 p-3 sm:grid-cols-[1fr_7rem_9rem_8rem_auto]">
            <div><label className={labelCls}>תיאור</label><input disabled={!editable} className={field} placeholder="לדוגמה: שעות ייעוץ" value={item.description} onChange={(e) => updateItem(item.id, { description: e.target.value })} /></div>
            <div><label className={labelCls}>כמות</label><input disabled={!editable} type="number" min={0} step="0.01" className={field} value={item.quantity} onChange={(e) => updateItem(item.id, { quantity: Number(e.target.value) })} /></div>
            <div><label className={labelCls}>מחיר ליחידה (₪)</label><input disabled={!editable} type="number" min={0} step="0.01" className={field} value={item.unitPrice} onChange={(e) => updateItem(item.id, { unitPrice: Number(e.target.value) })} /></div>
            <div className="pb-2 text-sm font-semibold text-foreground">{money(item.quantity * item.unitPrice)}</div>
            {editable && <button type="button" aria-label="מחיקת שורה" onClick={() => setDoc((d) => ({ ...d, items: d.items.filter((i) => i.id !== item.id) }))} className="mb-1 rounded-lg p-2 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"><Trash2 className="size-4" /></button>}
          </div>)}
        </div>
        {editable && <button type="button" onClick={() => setDoc((d) => ({ ...d, items: [...d.items, { id: uid(), description: "", quantity: 1, unitPrice: 0 }] }))} className="mt-4 inline-flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-sm font-medium text-muted-foreground transition hover:border-ring hover:text-foreground"><Plus className="size-4" />הוספת שורה</button>}

        <div className="mt-6 grid gap-4 border-t border-border pt-5 sm:grid-cols-2">
          <div className="space-y-4">
            <div><label className={labelCls}>שיעור מע״מ (%)</label><input type="number" min={0} step="0.01" disabled={!editable} className={`${field} max-w-32`} value={doc.vatRate} onChange={(e) => set("vatRate", Number(e.target.value))} /></div>
            {doc.type === "receipt" && <div><label className={labelCls}>אמצעי תשלום</label><input disabled={!editable} className={field} placeholder="העברה בנקאית / אשראי / מזומן" value={doc.paymentMethod ?? ""} onChange={(e) => set("paymentMethod", e.target.value)} /></div>}
            {doc.type === "creditNote" && <div><label className={labelCls}>אסמכתא למסמך המקורי</label><select disabled={!editable} className={field} value={doc.relatedDocId ?? ""} onChange={(e) => set("relatedDocId", e.target.value || undefined)}><option value="">בחירת מסמך מקורי…</option>{allDocs.filter((d) => d.type === "invoice" && d.status !== "draft").map((d) => <option key={d.id} value={d.id}>{d.number}</option>)}</select></div>}
            <div><label className={labelCls}>הערות</label><textarea disabled={!editable} rows={3} className={field} value={doc.notes ?? ""} onChange={(e) => set("notes", e.target.value)} /></div>
          </div>
          <div className="space-y-2 rounded-xl bg-secondary/60 p-4 text-sm"><div className="flex justify-between text-muted-foreground"><span>סכום ביניים</span><span className="font-medium text-foreground">{money(t.subtotal)}</span></div><div className="flex justify-between text-muted-foreground"><span>מע״מ {doc.vatRate}%</span><span className="font-medium text-foreground">{money(t.vat)}</span></div><div className="flex justify-between border-t border-border pt-2 text-base font-bold text-foreground"><span>סה״כ לתשלום</span><span>{money(t.total)}</span></div></div>
        </div>
      </section>

      {editable && <div className="flex justify-start gap-3"><button onClick={save} className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"><Save className="size-4" />שמירת טיוטה</button></div>}
    </div>
  );
}
