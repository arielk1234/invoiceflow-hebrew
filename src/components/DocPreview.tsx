import { dateHe, money, totals, typeLabel, type BusinessInfo, type Client, type Doc } from "@/lib/store";

export function DocPreview({ doc, client, business }: { doc: Doc; client?: Client; business: BusinessInfo }) {
  const t = totals(doc);
  const title = typeLabel[doc.type];

  return (
    <article id="doc-print-area" className="rounded-2xl border border-border bg-card p-8 shadow-sm print:rounded-none print:border-0 print:p-0 print:shadow-none">
      <header className="flex flex-wrap items-start justify-between gap-6 border-b border-border pb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">מס׳ {doc.number || "טיוטה"}</p>
          <p className="mt-3 text-sm text-muted-foreground">תאריך הפקה: <span className="text-foreground">{dateHe(doc.issueDate)}</span></p>
          <p className="text-sm text-muted-foreground">{doc.type === "invoice" ? "לתשלום עד" : "תאריך תשלום"}: <span className="text-foreground">{dateHe(doc.dueDate)}</span></p>
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
        <p className="text-xs font-semibold text-muted-foreground">לכבוד</p>
        <p className="mt-1 text-base font-bold text-foreground">{client?.name ?? "— לא נבחר לקוח —"}</p>
        {client?.taxId && <p className="text-sm text-muted-foreground">ח.פ / ע.מ {client.taxId}</p>}
        {client?.address && <p className="text-sm text-muted-foreground">{client.address}</p>}
        {client?.email && <p className="text-sm text-muted-foreground">{client.email}</p>}
      </section>

      <table className="mt-6 w-full text-right text-sm">
        <thead><tr className="border-b border-border text-xs text-muted-foreground"><th className="py-2 font-semibold">תיאור</th><th className="py-2 font-semibold">כמות</th><th className="py-2 font-semibold">מחיר יחידה</th><th className="py-2 text-left font-semibold">סה״כ</th></tr></thead>
        <tbody>{doc.items.map((i) => <tr key={i.id} className="border-b border-border/60"><td className="py-3 text-foreground">{i.description || "—"}</td><td className="py-3 text-muted-foreground">{i.quantity}</td><td className="py-3 text-muted-foreground">{money(i.unitPrice)}</td><td className="py-3 text-left font-medium text-foreground">{money(i.quantity * i.unitPrice)}</td></tr>)}</tbody>
      </table>

      <div className="mt-6 flex justify-end">
        <div className="w-full max-w-xs space-y-2 text-sm">
          <div className="flex justify-between text-muted-foreground"><span>סכום ביניים</span><span className="text-foreground">{money(t.subtotal)}</span></div>
          <div className="flex justify-between text-muted-foreground"><span>מע״מ {doc.vatRate}%</span><span className="text-foreground">{money(t.vat)}</span></div>
          <div className="flex justify-between rounded-lg bg-secondary px-3 py-2 text-base font-bold text-foreground"><span>סה״כ {title}</span><span>{money(t.total)}</span></div>
        </div>
      </div>

      {doc.allocationNumber && <div className="mt-6 rounded-lg border border-border bg-secondary/40 p-3 text-sm"><span className="font-semibold">מספר הקצאה:</span> {doc.allocationNumber}</div>}
      {doc.relatedDocumentId && <p className="mt-3 text-sm text-muted-foreground">מסמך מקור לזיכוי: {doc.relatedDocumentId}</p>}
      {doc.paymentMethod && <p className="mt-6 text-sm text-muted-foreground">אמצעי תשלום: <span className="text-foreground">{doc.paymentMethod}</span></p>}
      {doc.notes && <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">{doc.notes}</p>}
    </article>
  );
}
