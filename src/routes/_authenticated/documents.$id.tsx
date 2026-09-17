import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Download, Pencil, ArrowRight, Ban, FileCheck2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { DocEditor } from "@/components/DocEditor";
import { DocPreview } from "@/components/DocPreview";
import { StatusBadge } from "@/components/StatusBadge";
import { actions, isLocked, statusLabel, typeLabel, useData, type DocStatus } from "@/lib/store";

export const Route = createFileRoute("/_authenticated/documents/$id")({
  head: () => ({
    meta: [
      { title: "צפייה במסמך — חשבונית קלה" },
      { name: "description", content: "תצוגה, הפקה מבוקרת, סטטוס והדפסה של מסמך חשבונאי." },
    ],
  }),
  component: DocPage,
});

function DocPage() {
  const { id } = Route.useParams();
  const data = useData();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);

  if (!data) return <AppShell>טוען…</AppShell>;

  const doc = data.docs.find((d) => d.id === id);
  if (!doc) {
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground">המסמך לא נמצא.</p>
        <Link to="/documents" className="mt-3 inline-block text-sm text-primary hover:underline">חזרה לרשימת המסמכים</Link>
      </AppShell>
    );
  }

  const client = data.clients.find((c) => c.id === doc.clientId);
  const locked = isLocked(doc);

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-center gap-3 print:hidden">
        <Link to="/documents" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowRight className="size-4" />חזרה</Link>
        <h1 className="text-xl font-bold text-foreground">{typeLabel[doc.type]} {doc.number || "טיוטה"}</h1>
        <StatusBadge status={doc.status} />

        <div className="mr-auto flex flex-wrap items-center gap-2">
          {!locked && (
            <button
              onClick={() => setEditing((v) => !v)}
              className="inline-flex items-center gap-2 rounded-lg border border-input px-3 py-2 text-sm font-medium text-foreground transition hover:bg-secondary"
            >
              <Pencil className="size-4" />{editing ? "סיום עריכה" : "עריכה"}
            </button>
          )}

          {!locked && (
            <button
              onClick={async () => {
                try {
                  await actions.issueDoc(doc.id);
                  toast.success("המסמך הופק וקיבל מספר סופי");
                } catch (error) {
                  const message = error instanceof Error ? error.message : "";
                  if (message.includes("ALLOCATION_NUMBER_REQUIRED")) toast.error("נדרש מספר הקצאה לפני הפקת החשבונית");
                  else toast.error("לא ניתן להפיק את המסמך. בדוק את פרטי המסמך.");
                }
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
            >
              <FileCheck2 className="size-4" />הפק מסמך
            </button>
          )}

          <div className="inline-flex rounded-xl bg-secondary p-1">
            {(["sent", "paid"] as DocStatus[]).map((s) => (
              <button
                key={s}
                disabled={!locked || doc.status === "cancelled"}
                onClick={async () => {
                  try {
                    await actions.setStatus(doc.id, s);
                    toast.success(`הסטטוס עודכן ל״${statusLabel[s]}״`);
                  } catch {
                    toast.error("לא ניתן לשנות את הסטטוס");
                  }
                }}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-40 ${doc.status === s ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}
              >{statusLabel[s]}</button>
            ))}
          </div>

          <button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-lg border border-input px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-secondary"><Download className="size-4" />הדפסה / PDF</button>

          {locked && doc.status !== "cancelled" && (
            <button
              onClick={async () => {
                try {
                  await actions.cancelDoc(doc.id, "ביטול על ידי המשתמש");
                  toast.success("המסמך בוטל ונשמר ברשומות");
                } catch {
                  toast.error("אין לך הרשאה לבטל מסמך זה");
                }
              }}
              className="inline-flex items-center gap-2 rounded-lg border border-input px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
            ><Ban className="size-4" />ביטול מסמך</button>
          )}
        </div>
      </div>

      {editing ? (
        <DocEditor initial={doc} clients={data.clients} documents={data.docs} onDone={() => setEditing(false)} />
      ) : (
        <DocPreview doc={doc} client={client} business={data.business} />
      )}

      {doc.contentHash && (
        <p className="mt-4 text-xs text-muted-foreground print:hidden">מזהה שלמות מסמך: {doc.contentHash}</p>
      )}
    </AppShell>
  );
}
