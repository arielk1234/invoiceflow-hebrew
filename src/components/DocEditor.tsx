import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Trash2, Plus, Save, FileCheck2 } from "lucide-react";
import { toast } from "sonner";
import {
  actions,
  CHEQUE,
  chequeDetailsMissing,
  DEFAULT_UNIT,
  isExemptBusiness,
  money,
  PAYMENT_METHODS,
  totals,
  uid,
  type BusinessInfo,
  type Client,
  type Doc,
  type DocType,
} from "@/lib/store";
import { allocationThresholdForDate } from "@/lib/israel-compliance";
import { errorMessage, isHeldInvoiceError } from "@/lib/error-messages";

const field =
  "w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/30";
const labelCls = "mb-1.5 block text-xs font-semibold text-muted-foreground";

export function DocEditor({
  initial,
  business,
  clients,
  documents = [],
  onDone,
}: {
  initial: Doc;
  business: BusinessInfo;
  clients: Client[];
  documents?: Doc[];
  onDone?: () => void;
}) {
  const navigate = useNavigate();
  const [doc, setDoc] = useState<Doc>(initial);
  const [saving, setSaving] = useState(false);
  const t = totals(doc);
  const exempt = isExemptBusiness(business);
  const selectedClient = clients.find((c) => c.id === doc.clientId);
  const allocationThreshold = allocationThresholdForDate(doc.issueDate);
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
    if (issueAfterSave && doc.type === "credit_note" && !doc.creditReason?.trim()) {
      toast.error("יש לציין את סיבת הזיכוי");
      return;
    }
    const todayInIsrael = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
    if (issueAfterSave && doc.issueDate > todayInIsrael) {
      toast.error("אי אפשר להפיק מסמך בתאריך עתידי");
      return;
    }
    if (issueAfterSave && chequeDetailsMissing(doc)) {
      toast.error("בתשלום בהמחאה יש למלא מספר בנק, סניף, חשבון ומספר המחאה");
      return;
    }
    setSaving(true);
    let savedId: string | null = null;
    const leave = (id: string) => {
      if (onDone) onDone();
      else navigate({ to: "/documents/$id", params: { id } });
    };
    try {
      const id = await actions.saveDoc(doc);
      savedId = id;
      if (issueAfterSave) {
        await actions.issueDoc(id);
        toast.success("המסמך הופק וננעל");
      } else {
        toast.success("המסמך נשמר בענן");
      }
      leave(id);
    } catch (error) {
      toast.error(errorMessage(error, issueAfterSave ? "הפקת המסמך נכשלה" : "שמירת המסמך נכשלה"));
      // A held invoice is decided on its page, which shows the options.
      if (savedId && isHeldInvoiceError(error)) leave(savedId);
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
              disabled={exempt && tp !== "receipt"}
              title={exempt && tp !== "receipt" ? "עוסק פטור מפיק קבלות בלבד" : undefined}
              className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${doc.type === tp ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}
            >
              {tp === "invoice" ? "חשבונית מס" : tp === "receipt" ? "קבלה" : "חשבונית זיכוי"}
            </button>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className={labelCls}>מספר מסמך</label>
            <input
              className={`${field} bg-secondary/60 text-muted-foreground`}
              value={doc.number || "יוקצה בעת ההפקה"}
              readOnly
              disabled
            />
          </div>
          <div>
            <label className={labelCls}>לקוח</label>
            <select
              className={field}
              value={doc.clientId}
              onChange={(e) => set("clientId", e.target.value)}
            >
              <option value="">בחירת לקוח…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>תאריך הפקה</label>
            <input
              type="date"
              className={field}
              value={doc.issueDate}
              onChange={(e) => set("issueDate", e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>
              {doc.type === "invoice" ? "תאריך לתשלום" : "תאריך תשלום"}
            </label>
            <input
              type="date"
              className={field}
              value={doc.dueDate}
              onChange={(e) => set("dueDate", e.target.value)}
            />
          </div>
        </div>

        {doc.type === "credit_note" && (
          <div className="mt-4">
            <label className={labelCls}>מסמך מקורי לזיכוי</label>
            <select
              className={field}
              value={doc.relatedDocumentId ?? ""}
              onChange={(e) => set("relatedDocumentId", e.target.value || undefined)}
            >
              <option value="">בחירת חשבונית מקור…</option>
              {documents
                .filter((d) => d.type === "invoice" && d.status !== "draft")
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.number || d.id}
                  </option>
                ))}
            </select>
            <label className={`${labelCls} mt-4`}>סיבת הזיכוי</label>
            <input
              className={field}
              placeholder="לדוגמה: החזרת סחורה, תיקון מחיר"
              value={doc.creditReason ?? ""}
              onChange={(e) => set("creditReason", e.target.value)}
            />
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h2 className="mb-4 text-base font-bold text-foreground">שורות חיוב</h2>
        <div className="space-y-3">
          {doc.items.map((item) => (
            <div
              key={item.id}
              className="grid items-end gap-3 rounded-xl bg-secondary/50 p-3 sm:grid-cols-[1fr_6rem_6rem_8rem_7rem_auto]"
            >
              <div>
                <label className={labelCls}>תיאור</label>
                <input
                  className={field}
                  placeholder="לדוגמה: שירות מקצועי"
                  value={item.description}
                  onChange={(e) => updateItem(item.id, { description: e.target.value })}
                />
              </div>
              <div>
                <label className={labelCls}>יחידת מידה</label>
                <input
                  className={field}
                  placeholder={DEFAULT_UNIT}
                  value={item.unit}
                  onChange={(e) => updateItem(item.id, { unit: e.target.value })}
                />
              </div>
              <div>
                <label className={labelCls}>כמות</label>
                <input
                  type="number"
                  min={0}
                  step="0.5"
                  className={field}
                  value={item.quantity}
                  onChange={(e) => updateItem(item.id, { quantity: Number(e.target.value) })}
                />
              </div>
              <div>
                <label className={labelCls}>מחיר ליחידה (₪)</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  className={field}
                  value={item.unitPrice}
                  onChange={(e) => updateItem(item.id, { unitPrice: Number(e.target.value) })}
                />
              </div>
              <div className="pb-2 text-sm font-semibold text-foreground">
                {money(item.quantity * item.unitPrice)}
              </div>
              <button
                type="button"
                aria-label="מחיקת שורה"
                onClick={() =>
                  setDoc((d) => ({ ...d, items: d.items.filter((i) => i.id !== item.id) }))
                }
                className="mb-1 rounded-lg p-2 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() =>
            setDoc((d) => ({
              ...d,
              items: [
                ...d.items,
                { id: uid(), description: "", unit: DEFAULT_UNIT, quantity: 1, unitPrice: 0 },
              ],
            }))
          }
          className="mt-4 inline-flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-sm font-medium text-muted-foreground transition hover:border-ring hover:text-foreground"
        >
          <Plus className="size-4" />
          הוספת שורה
        </button>

        <div className="mt-6 grid gap-4 border-t border-border pt-5 sm:grid-cols-2">
          <div className="space-y-4">
            <div>
              <label className={labelCls}>שיעור מע״מ (%)</label>
              <input
                type="number"
                min={0}
                step="0.5"
                className={`${field} max-w-32`}
                value={doc.vatRate}
                onChange={(e) => set("vatRate", Number(e.target.value))}
              />
            </div>
            {doc.type === "receipt" && (
              <div>
                <label className={labelCls}>אמצעי תשלום</label>
                <select
                  className={field}
                  value={doc.paymentMethod ?? ""}
                  onChange={(e) => set("paymentMethod", e.target.value)}
                >
                  <option value="">בחירת אמצעי תשלום…</option>
                  {/* A method typed freely before this list existed stays selectable. */}
                  {doc.paymentMethod && !PAYMENT_METHODS.includes(doc.paymentMethod) && (
                    <option value={doc.paymentMethod}>{doc.paymentMethod}</option>
                  )}
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {doc.type === "receipt" && doc.paymentMethod === CHEQUE && (
              <div className="grid gap-3 rounded-xl bg-secondary/50 p-3 sm:grid-cols-2">
                {(
                  [
                    ["chequeBank", "מספר בנק", 10],
                    ["chequeBranch", "מספר סניף", 10],
                    ["chequeAccount", "מספר חשבון", 15],
                    ["chequeNumber", "מספר המחאה", 10],
                  ] as const
                ).map(([key, label, max]) => (
                  <div key={key}>
                    <label className={labelCls}>{label}</label>
                    <input
                      className={field}
                      inputMode="numeric"
                      maxLength={max}
                      value={doc[key] ?? ""}
                      onChange={(e) => set(key, e.target.value.replace(/\D/g, "") || undefined)}
                    />
                  </div>
                ))}
                <p className="text-xs text-muted-foreground sm:col-span-2">
                  תאריך הפירעון של ההמחאה הוא ״תאריך תשלום״ שלמעלה.
                </p>
              </div>
            )}
            {doc.type === "invoice" && allocationRelevant && (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                <label className="flex items-start gap-3 text-sm font-medium text-foreground">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={doc.allocationRequested}
                    onChange={(e) => set("allocationRequested", e.target.checked)}
                  />
                  <span>הלקוח ביקש מספר הקצאה לחשבונית זו</span>
                </label>
                {doc.allocationRequested && (
                  <div className="mt-3">
                    <label className={labelCls}>מספר הקצאה שהתקבל מרשות המסים</label>
                    <input
                      className={field}
                      inputMode="numeric"
                      maxLength={30}
                      value={doc.allocationNumber ?? ""}
                      onChange={(e) =>
                        set("allocationNumber", e.target.value.replace(/\D/g, "") || undefined)
                      }
                      placeholder="המספר המלא או 9 הספרות האחרונות"
                    />
                  </div>
                )}
                <p className="mt-2 text-xs text-muted-foreground">
                  לפי כללי 2026, הסף הוא מעל {allocationThreshold.toLocaleString("he-IL")} ₪ לפני
                  מע״מ, כאשר מתקיימים התנאים הרלוונטיים. כשהלקוח ביקש מספר הקצאה ולא הוזן מספר, הוא
                  יתבקש אוטומטית מרשות המסים בעת ההפקה.
                </p>
              </div>
            )}
            <div>
              <label className={labelCls}>הערות</label>
              <textarea
                rows={3}
                className={field}
                value={doc.notes ?? ""}
                onChange={(e) => set("notes", e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2 rounded-xl bg-secondary/60 p-4 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>סכום ביניים</span>
              <span className="font-medium text-foreground">{money(t.subtotal)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>מע״מ {doc.vatRate}%</span>
              <span className="font-medium text-foreground">{money(t.vat)}</span>
            </div>
            <div className="flex justify-between border-t border-border pt-2 text-base font-bold text-foreground">
              <span>סה״כ לתשלום</span>
              <span>{money(t.total)}</span>
            </div>
          </div>
        </div>
      </section>

      <div className="flex flex-wrap justify-start gap-3">
        <button
          disabled={saving}
          onClick={() => void save(false)}
          className="inline-flex items-center gap-2 rounded-lg border border-input px-5 py-2.5 text-sm font-semibold text-foreground transition hover:bg-secondary disabled:opacity-50"
        >
          <Save className="size-4" />
          שמירת טיוטה
        </button>
        <button
          disabled={saving}
          onClick={() => void save(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
        >
          <FileCheck2 className="size-4" />
          שמירה והפקה
        </button>
      </div>
    </div>
  );
}
