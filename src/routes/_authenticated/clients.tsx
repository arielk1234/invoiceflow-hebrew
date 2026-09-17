import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { actions, money, totals, uid, useData, type Client } from "@/lib/store";

export const Route = createFileRoute("/_authenticated/clients")({
  head: () => ({
    meta: [
      { title: "לקוחות — חשבונית קלה" },
      {
        name: "description",
        content: "ניהול פרטי לקוחות: שם, ח.פ, כתובת ופרטי קשר לשימוש חוזר בחשבוניות.",
      },
      { property: "og:title", content: "לקוחות — חשבונית קלה" },
      { property: "og:description", content: "כרטיסיות לקוח לשימוש מהיר בהפקת מסמכים." },
    ],
  }),
  component: ClientsPage,
});

const field =
  "w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30";
const labelCls = "mb-1.5 block text-xs font-semibold text-muted-foreground";

const blank = (): Client => ({ id: uid(), name: "" });

function ClientsPage() {
  const data = useData();
  const [draft, setDraft] = useState<Client | null>(null);

  if (!data) return <AppShell>טוען…</AppShell>;

  const save = async () => {
    if (!draft?.name.trim()) {
      toast.error("יש להזין שם לקוח");
      return;
    }
    try {
      await actions.saveClient(draft);
      setDraft(null);
      toast.success("הלקוח נשמר בענן");
    } catch {
      toast.error("שמירת הלקוח נכשלה");
    }
  };

  return (
    <AppShell>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">לקוחות</h1>
        <button
          onClick={() => setDraft(blank())}
          className="inline-flex items-center gap-2 rounded-lg border border-input px-3 py-2 text-sm font-medium transition hover:bg-secondary"
        >
          <Plus className="size-4" />
          לקוח חדש
        </button>
      </div>

      {draft && (
        <section className="mt-5 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className={labelCls}>שם הלקוח</label>
              <input
                className={field}
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </div>
            <div>
              <label className={labelCls}>ח.פ / ע.מ</label>
              <input
                className={field}
                value={draft.taxId ?? ""}
                onChange={(e) => setDraft({ ...draft, taxId: e.target.value })}
              />
            </div>
            <div>
              <label className={labelCls}>דוא״ל</label>
              <input
                className={field}
                value={draft.email ?? ""}
                onChange={(e) => setDraft({ ...draft, email: e.target.value })}
              />
            </div>
            <div>
              <label className={labelCls}>טלפון</label>
              <input
                className={field}
                value={draft.phone ?? ""}
                onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>כתובת</label>
              <input
                className={field}
                value={draft.address ?? ""}
                onChange={(e) => setDraft({ ...draft, address: e.target.value })}
              />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              onClick={save}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              שמירה
            </button>
            <button
              onClick={() => setDraft(null)}
              className="rounded-lg border border-input px-4 py-2 text-sm font-medium hover:bg-secondary"
            >
              ביטול
            </button>
          </div>
        </section>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data.clients.map((c) => {
          const clientDocs = data.docs.filter((d) => d.clientId === c.id);
          const sum = clientDocs.reduce((a, d) => a + totals(d).total, 0);
          return (
            <div key={c.id} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-base font-bold text-foreground">{c.name}</h2>
                <div className="flex gap-1">
                  <button
                    aria-label="עריכת לקוח"
                    onClick={() => setDraft(c)}
                    className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                  >
                    <Pencil className="size-4" />
                  </button>
                  <button
                    aria-label="מחיקת לקוח"
                    onClick={async () => {
                      try {
                        await actions.deleteClient(c.id);
                        toast.success("הלקוח נמחק");
                      } catch {
                        toast.error("לא ניתן למחוק לקוח שמשויך למסמכים");
                      }
                    }}
                    className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>
              {c.taxId && <p className="mt-1 text-sm text-muted-foreground">ח.פ {c.taxId}</p>}
              {c.email && <p className="text-sm text-muted-foreground">{c.email}</p>}
              {c.phone && <p className="text-sm text-muted-foreground">{c.phone}</p>}
              {c.address && <p className="text-sm text-muted-foreground">{c.address}</p>}
              <p className="mt-4 border-t border-border pt-3 text-sm text-muted-foreground">
                {clientDocs.length} מסמכים ·{" "}
                <span className="font-semibold text-foreground">{money(sum)}</span>
              </p>
            </div>
          );
        })}
      </div>
    </AppShell>
  );
}
