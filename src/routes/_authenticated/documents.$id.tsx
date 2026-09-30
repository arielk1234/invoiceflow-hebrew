import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Download, Pencil, ArrowRight, Ban, FileCheck2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AllocationDecisionPanel } from "@/components/AllocationDecisionPanel";
import { AppShell } from "@/components/AppShell";
import { DocEditor } from "@/components/DocEditor";
import { DocPreview } from "@/components/DocPreview";
import { StatusBadge } from "@/components/StatusBadge";
import { actions, isLocked, statusLabel, typeLabel, useData, type DocStatus } from "@/lib/store";
import { errorMessage } from "@/lib/error-messages";

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
  // Set only for the print that was recorded as the original; any other output is a copy.
  const [copyLabel, setCopyLabel] = useState<"מקור" | "העתק" | undefined>();
  const [printing, setPrinting] = useState(false);

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
  const locked = isLocked(doc);
  const related = doc.relatedDocumentId
    ? data.docs.find((d) => d.id === doc.relatedDocumentId)
    : undefined;

  // An issued document prints "מקור" once and "העתק" afterwards (appendix H (a)(4));
  // a draft prints with its "טיוטה" marking.
  const print = async () => {
    if (!locked) {
      window.print();
      return;
    }
    setPrinting(true);
    try {
      const label = await actions.recordPrint(doc.id);
      setCopyLabel(label);
      window.addEventListener("afterprint", () => setCopyLabel(undefined), { once: true });
      // Let the marking render before the print dialog opens.
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      window.print();
    } catch (error) {
      toast.error(errorMessage(error, "לא ניתן להדפיס את המסמך"));
    } finally {
      setPrinting(false);
    }
  };

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
          {typeLabel[doc.type]} {doc.number || "טיוטה"}
        </h1>
        <StatusBadge status={doc.status} />

        <div className="mr-auto flex flex-wrap items-center gap-2">
          {!locked && (
            <button
              onClick={() => setEditing((v) => !v)}
              className="inline-flex items-center gap-2 rounded-lg border border-input px-3 py-2 text-sm font-medium text-foreground transition hover:bg-secondary"
            >
              <Pencil className="size-4" />
              {editing ? "סיום עריכה" : "עריכה"}
            </button>
          )}

          {!locked && (
            <button
              onClick={async () => {
                try {
                  await actions.issueDoc(doc.id);
                  toast.success("המסמך הופק וקיבל מספר סופי");
                } catch (error) {
                  toast.error(errorMessage(error, "לא ניתן להפיק את המסמך. בדוק את פרטי המסמך."));
                }
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
            >
              <FileCheck2 className="size-4" />
              הפק מסמך
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
                  } catch (error) {
                    toast.error(errorMessage(error, "לא ניתן לשנות את הסטטוס"));
                  }
                }}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-40 ${doc.status === s ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}
              >
                {statusLabel[s]}
              </button>
            ))}
          </div>

          <button
            onClick={() => void print()}
            disabled={printing}
            className="inline-flex items-center gap-2 rounded-lg border border-input px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-secondary disabled:opacity-50"
          >
            <Download className="size-4" />
            {!locked ? "הדפסת טיוטה" : doc.printCount ? "הדפסת העתק / PDF" : "הדפסת מקור / PDF"}
          </button>

          {!locked && (
            <button
              onClick={async () => {
                if (!window.confirm("למחוק את הטיוטה?")) return;
                try {
                  await actions.deleteDoc(doc.id);
                  toast.success("הטיוטה נמחקה");
                  navigate({ to: "/documents" });
                } catch (error) {
                  toast.error(errorMessage(error, "לא ניתן למחוק את הטיוטה"));
                }
              }}
              className="inline-flex items-center gap-2 rounded-lg border border-input px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="size-4" />
              מחיקת טיוטה
            </button>
          )}

          {locked && doc.status !== "cancelled" && (
            <button
              onClick={async () => {
                // Cancelling cannot be undone; the document stays on record as cancelled.
                const reason = window.prompt(
                  "ביטול מסמך אינו הפיך, והמסמך יישאר ברשומות כמבוטל. מה סיבת הביטול?",
                );
                if (reason === null) return;
                try {
                  await actions.cancelDoc(doc.id, reason.trim() || "ביטול על ידי המשתמש");
                  toast.success("המסמך בוטל ונשמר ברשומות");
                } catch (error) {
                  toast.error(errorMessage(error, "לא ניתן לבטל את המסמך"));
                }
              }}
              className="inline-flex items-center gap-2 rounded-lg border border-input px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
            >
              <Ban className="size-4" />
              ביטול מסמך
            </button>
          )}
        </div>
      </div>

      {doc.status === "draft" && (doc.allocationHoldCode || doc.allocationDecision) && (
        <AllocationDecisionPanel
          doc={doc}
          canDecide={data.role === "owner" || data.role === "admin"}
        />
      )}

      {editing ? (
        <DocEditor
          initial={doc}
          business={data.business}
          clients={data.clients}
          documents={data.docs}
          onDone={() => setEditing(false)}
        />
      ) : (
        <DocPreview
          doc={doc}
          client={client}
          business={data.business}
          related={related}
          copyLabel={copyLabel ?? (locked ? "העתק" : undefined)}
        />
      )}

      {doc.contentHash && (
        <p className="mt-4 text-xs text-muted-foreground print:hidden">
          מזהה שלמות מסמך: {doc.contentHash}
        </p>
      )}
    </AppShell>
  );
}
