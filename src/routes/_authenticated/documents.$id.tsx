import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Download, Pencil, Trash2, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { DocEditor } from "@/components/DocEditor";
import { DocPreview } from "@/components/DocPreview";
import { StatusBadge } from "@/components/StatusBadge";
import { actions, statusLabel, typeLabel, useData, type DocStatus } from "@/lib/store";

export const Route = createFileRoute("/_authenticated/documents/$id")({
  head: () => ({
    meta: [
      { title: "צפייה במסמך — חשבונית קלה" },
      {
        name: "description",
        content: "תצוגה מקדימה של החשבונית או הקבלה, שינוי סטטוס והורדה כקובץ PDF.",
      },
      { property: "og:title", content: "צפייה במסמך — חשבונית קלה" },
      { property: "og:description", content: "תצוגה מקדימה, סטטוס תשלום והורדת PDF." },
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
        <Link to="/documents" className="mt-3 inline-block text-sm text-primary hover:underline">
          חזרה לרשימת המסמכים
        </Link>
      </AppShell>
    );
  }

  const client = data.clients.find((c) => c.id === doc.clientId);

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-center gap-3 print:hidden">
        <Link
          to="/documents"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowRight className="size-4" />
          חזרה
        </Link>
        <h1 className="text-xl font-bold text-foreground">
          {typeLabel[doc.type]} {doc.number}
        </h1>
        <StatusBadge status={doc.status} />

        <div className="mr-auto flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl bg-secondary p-1">
            {(["draft", "sent", "paid"] as DocStatus[]).map((s) => (
              <button
                key={s}
                disabled={locked && s === "draft"}
                onClick={async () => {
                  try {
                    await actions.setStatus(doc.id, s);
                    toast.success(`הסטטוס עודכן ל״${statusLabel[s]}״`);
                  } catch {
                    toast.error("לא ניתן לשנות את הסטטוס של מסמך שהופק");
                  }
                }}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-40 ${
                  doc.status === s ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
                }`}
              >
                {statusLabel[s]}
              </button>
            ))}
          </div>

          {!locked && (
            <button
              onClick={() => setEditing((v) => !v)}
              className="inline-flex items-center gap-2 rounded-lg border border-input px-3 py-2 text-sm font-medium text-foreground transition hover:bg-secondary"
            >
              <Pencil className="size-4" />
              {editing ? "סיום עריכה" : "עריכה"}
            </button>
          )}

          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
          >
            <Download className="size-4" />
            הורדת PDF
          </button>

          {locked ? (
            doc.status !== "cancelled" && (
              <button
                onClick={async () => {
                  try {
                    await actions.cancelDoc(doc.id);
                    toast.success("המסמך בוטל");
                  } catch {
                    toast.error("אין לך הרשאה לבטל מסמך");
                  }
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-input px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
              >
                <Ban className="size-4" />
                ביטול מסמך
              </button>
            )
          ) : (
            <button
              onClick={async () => {
                try {
                  await actions.deleteDoc(doc.id);
                  toast.success("המסמך נמחק");
                  navigate({ to: "/documents" });
                } catch {
                  toast.error("לא ניתן למחוק את המסמך");
                }
              }}
              aria-label="מחיקת מסמך"
              className="rounded-lg p-2 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="size-4" />
            </button>
          )}
        </div>
      </div>

      {editing ? (
        <DocEditor initial={doc} clients={data.clients} onDone={() => setEditing(false)} />
      ) : (
        <DocPreview doc={doc} client={client} business={data.business} />
      )}
    </AppShell>
  );
}
