import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Download, Pencil, Trash2, ArrowRight, ShieldCheck, Ban } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { DocEditor } from "@/components/DocEditor";
import { DocPreview } from "@/components/DocPreview";
import { StatusBadge } from "@/components/StatusBadge";
import { actions, requiresAllocationNumber, statusLabel, typeLabel, useData, totals, type DocStatus } from "@/lib/store";

export const Route = createFileRoute("/documents/$id")({
  head: () => ({ meta: [{ title: "צפייה במסמך — חשבונית קלה" }, { name: "description", content: "תצוגה מקדימה, הפקה, ביטול ותיעוד מסמך." }] }),
  component: DocPage,
});

function DocPage() {
  const { id } = Route.useParams();
  const data = useData();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);

  if (!data) return <AppShell>טוען…</AppShell>;
  const doc = data.docs.find((d) => d.id === id);
  if (!doc) return <AppShell><p className="text-sm text-muted-foreground">המסמך לא נמצא.</p><Link to="/documents" className="mt-3 inline-block text-sm text-primary hover:underline">חזרה לרשימת המסמכים</Link></AppShell>;

  const client = data.clients.find((c) => c.id === doc.clientId);
  const allocationRequired = requiresAllocationNumber(doc);
  const subtotal = totals(doc).subtotal;

  const issue = () => {
    if (allocationRequired && !doc.allocationNumber) {
      toast.error("חשבונית זו דורשת מספר הקצאה מרשות המסים לפני שליחתה ללקוח");
      return;
    }
    try { actions.issueDoc(doc.id); toast.success("המסמך הופק וננעל לעריכה"); } catch (e) { toast.error(e instanceof Error ? e.message : "לא ניתן להפיק את המסמך"); }
  };

  const cancel = () => {
    const reason = window.prompt("סיבת ביטול המסמך:");
    if (reason === null) return;
    try { actions.cancelDoc(doc.id, reason); toast.success("המסמך סומן כמבוטל ונשמר בתיעוד"); } catch (e) { toast.error(e instanceof Error ? e.message : "לא ניתן לבטל את המסמך"); }
  };

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-center gap-3 print:hidden">
        <Link to="/documents" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowRight className="size-4" />חזרה</Link>
        <h1 className="text-xl font-bold text-foreground">{typeLabel[doc.type]} {doc.number}</h1>
        <StatusBadge status={doc.status} />
        <div className="mr-auto flex flex-wrap items-center gap-2">
          {doc.status === "draft" && <button onClick={issue} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"><ShieldCheck className="size-4" />הפקת מסמך</button>}
          {doc.status !== "draft" && doc.status !== "cancelled" && <button onClick={cancel} className="inline-flex items-center gap-2 rounded-lg border border-destructive/30 px-3 py-2 text-sm font-semibold text-destructive"><Ban className="size-4" />ביטול</button>}
          <div className="inline-flex rounded-xl bg-secondary p-1">
            {(["sent", "paid"] as DocStatus[]).map((s) => <button key={s} disabled={doc.status === "draft" || doc.status === "cancelled"} onClick={() => { actions.setStatus(doc.id, s); toast.success(`הסטטוס עודכן ל״${statusLabel[s]}״`); }} className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-40 ${doc.status === s ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>{statusLabel[s]}</button>)}
          </div>
          {doc.status === "draft" && <button onClick={() => setEditing((v) => !v)} className="inline-flex items-center gap-2 rounded-lg border border-input px-3 py-2 text-sm font-medium text-foreground transition hover:bg-secondary"><Pencil className="size-4" />{editing ? "סיום עריכה" : "עריכה"}</button>}
          <button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"><Download className="size-4" />הדפסה / PDF</button>
          {doc.status === "draft" && <button onClick={() => { try { actions.deleteDoc(doc.id); toast.success("הטיוטה נמחקה"); navigate({ to: "/documents" }); } catch (e) { toast.error(e instanceof Error ? e.message : "לא ניתן למחוק"); } }} aria-label="מחיקת טיוטה" className="rounded-lg p-2 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"><Trash2 className="size-4" /></button>}
        </div>
      </div>

      {doc.status !== "draft" && <div className="mb-5 grid gap-3 md:grid-cols-2 print:hidden">
        <div className="rounded-xl border border-emerald-300/40 bg-emerald-50 p-4 text-sm text-emerald-900"><p className="font-bold">מסמך קבוע</p><p className="mt-1">המסמך הופק ולכן תוכנו נעול. תיקון נעשה באמצעות זיכוי/מסמך חדש ולא באמצעות שינוי המסמך המקורי.</p></div>
        {allocationRequired && <div className={`rounded-xl border p-4 text-sm ${doc.allocationNumber ? "border-emerald-300/40 bg-emerald-50 text-emerald-900" : "border-amber-300/50 bg-amber-50 text-amber-900"}`}><p className="font-bold">מספר הקצאה</p><p className="mt-1">{doc.allocationNumber ? `מספר הקצאה: ${doc.allocationNumber}` : `החשבונית בסך ${subtotal.toLocaleString("he-IL")} ₪ לפני מע״מ דורשת מספר הקצאה. יש לחבר את ממשק רשות המסים לפני הפקה/שליחה.`}</p></div>}
      </div>}

      {editing ? <DocEditor initial={doc} clients={data.clients} allDocs={data.docs} onDone={() => setEditing(false)} /> : <DocPreview doc={doc} client={client} business={data.business} />}
    </AppShell>
  );
}
