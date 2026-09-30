import {
  dateHe,
  money,
  totals,
  typeLabel,
  type BusinessInfo,
  type Client,
  type Doc,
} from "@/lib/store";
import { shortAllocationNumber } from "@/lib/israel-compliance";

/**
 * A document as shown and printed. Follows chapter B (section 9) of the Income
 * Tax bookkeeping instructions and appendix H: a draft is marked "טיוטה", and a
 * printed issued document carries "מקור" on the first copy and "העתק" on others.
 */
export function DocPreview({
  doc,
  client,
  business,
  related,
  copyLabel,
}: {
  doc: Doc;
  client?: Client;
  business: BusinessInfo;
  /** The invoice a credit note credits. */
  related?: Doc;
  /** Set when an issued document is printed. */
  copyLabel?: "מקור" | "העתק";
}) {
  const t = totals(doc);
  const title = typeLabel[doc.type];
  const draft = doc.status === "draft";

  return (
    <article
      id="doc-print-area"
      className="relative overflow-hidden rounded-2xl border border-border bg-card p-8 shadow-sm print:rounded-none print:border-0 print:p-0 print:shadow-none"
    >
      {draft && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-center justify-center text-[9rem] font-black text-destructive/15 select-none print:text-destructive/25"
          style={{ transform: "rotate(-25deg)" }}
        >
          טיוטה
        </div>
      )}

      {(draft || copyLabel || doc.status === "cancelled") && (
        <div className="mb-4 flex flex-wrap gap-2">
          {draft && (
            <span className="rounded-md border-2 border-destructive px-3 py-1 text-lg font-black text-destructive">
              טיוטה — אינה מסמך חשבונאי
            </span>
          )}
          {copyLabel && (
            <span className="rounded-md border-2 border-foreground px-3 py-1 text-lg font-black text-foreground">
              {copyLabel}
            </span>
          )}
          {doc.status === "cancelled" && (
            <span className="rounded-md border-2 border-destructive px-3 py-1 text-lg font-black text-destructive">
              מבוטל
            </span>
          )}
        </div>
      )}

      <header className="flex flex-wrap items-start justify-between gap-6 border-b border-border pb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">מס׳ {doc.number || "טרם הוקצה"}</p>
          <p className="mt-3 text-sm text-muted-foreground">
            תאריך: <span className="text-foreground">{dateHe(doc.issueDate)}</span>
          </p>
          <p className="text-sm text-muted-foreground">
            {doc.type === "invoice" ? "לתשלום עד" : "תאריך תשלום"}:{" "}
            <span className="text-foreground">{dateHe(doc.dueDate)}</span>
          </p>
        </div>
        <div className="text-left">
          <p className="text-lg font-bold text-foreground">{business.name}</p>
          <p className="text-sm text-muted-foreground">ע.מ / ח.פ {business.taxId}</p>
          <p className="text-sm text-muted-foreground">{business.address}</p>
          <p className="text-sm text-muted-foreground">{business.phone}</p>
          <p className="text-sm text-muted-foreground">{business.email}</p>
        </div>
      </header>

      <section className="border-b border-border py-5">
        <p className="text-xs font-semibold text-muted-foreground">
          {doc.type === "receipt" ? "התקבל מאת" : "לכבוד"}
        </p>
        <p className="mt-1 text-base font-bold text-foreground">
          {client?.name ?? "— לא נבחר לקוח —"}
        </p>
        {client?.taxId && <p className="text-sm text-muted-foreground">ח.פ / ע.מ {client.taxId}</p>}
        {client?.address && <p className="text-sm text-muted-foreground">{client.address}</p>}
        {client?.email && <p className="text-sm text-muted-foreground">{client.email}</p>}
      </section>

      {doc.type === "credit_note" && (
        <section className="border-b border-border py-4 text-sm">
          <p className="text-muted-foreground">
            זיכוי בגין:{" "}
            <span className="text-foreground">
              {related
                ? `${typeLabel[related.type]} מס׳ ${related.number} מתאריך ${dateHe(related.issueDate)}`
                : "—"}
            </span>
          </p>
          <p className="mt-1 text-muted-foreground">
            סיבת הזיכוי: <span className="text-foreground">{doc.creditReason || "—"}</span>
          </p>
        </section>
      )}

      <table className="mt-6 w-full text-right text-sm">
        <thead>
          <tr className="border-b border-border text-xs text-muted-foreground">
            <th className="py-2 font-semibold">תיאור</th>
            <th className="py-2 font-semibold">יחידה</th>
            <th className="py-2 font-semibold">כמות</th>
            <th className="py-2 font-semibold">מחיר יחידה</th>
            <th className="py-2 text-left font-semibold">סה״כ</th>
          </tr>
        </thead>
        <tbody>
          {doc.items.map((i) => (
            <tr key={i.id} className="border-b border-border/60">
              <td className="py-3 text-foreground">{i.description || "—"}</td>
              <td className="py-3 text-muted-foreground">{i.unit}</td>
              <td className="py-3 text-muted-foreground">{i.quantity}</td>
              <td className="py-3 text-muted-foreground">{money(i.unitPrice)}</td>
              <td className="py-3 text-left font-medium text-foreground">
                {money(i.quantity * i.unitPrice)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-6 flex justify-end">
        <div className="w-full max-w-xs space-y-2 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>
              {doc.type === "credit_note" ? "סכום הזיכוי ללא מס ערך מוסף" : "סכום ביניים"}
            </span>
            <span className="text-foreground">{money(t.subtotal)}</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>מס ערך מוסף ({doc.vatRate}%)</span>
            <span className="text-foreground">{money(t.vat)}</span>
          </div>
          <div className="flex justify-between rounded-lg bg-secondary px-3 py-2 text-base font-bold text-foreground">
            <span>סה״כ {title}</span>
            <span>{money(t.total)}</span>
          </div>
        </div>
      </div>

      {doc.allocationNumber && (
        <div className="mt-6 rounded-lg border border-border bg-secondary/40 p-3 text-sm">
          <span className="font-semibold">מספר הקצאה:</span>{" "}
          <span className="font-bold tracking-wider">
            {shortAllocationNumber(doc.allocationNumber)}
          </span>
        </div>
      )}
      {/* Required on an invoice issued without allocation after the Tax Authority held it. */}
      {doc.allocationDecision === "continue" && !doc.allocationNumber && (
        <div className="mt-6 rounded-lg border-2 border-foreground p-3 text-center text-base font-bold text-foreground">
          אין לנכות מס תשומות בגין חשבונית זו
        </div>
      )}
      {doc.paymentMethod && (
        <p className="mt-6 text-sm text-muted-foreground">
          אמצעי תשלום: <span className="text-foreground">{doc.paymentMethod}</span>
          {doc.chequeNumber && (
            <span className="text-foreground">
              {" "}
              · המחאה {doc.chequeNumber}, בנק {doc.chequeBank}, סניף {doc.chequeBranch}, חשבון{" "}
              {doc.chequeAccount}, לפירעון {dateHe(doc.dueDate)}
            </span>
          )}
        </p>
      )}
      {doc.notes && (
        <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">{doc.notes}</p>
      )}

      {/* A receipt or credit note on paper is signed (section 5 and section 9). */}
      {(doc.type === "receipt" || doc.type === "credit_note") && (
        <p className="mt-10 hidden text-sm print:block">חתימה: ______________________</p>
      )}
      {/* Not a "מסמך ממוחשב": that requires an approved electronic signature (section 18B). */}
      <p className="mt-6 text-xs text-muted-foreground">הופק באמצעות InvoiceFlow</p>
    </article>
  );
}
