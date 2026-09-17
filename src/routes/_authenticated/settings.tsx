import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { actions, useData, type BusinessInfo } from "@/lib/store";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "הגדרות עסק — חשבונית קלה" },
      {
        name: "description",
        content: "עדכון פרטי העסק המופיעים בכותרת כל חשבונית וקבלה: שם, ע.מ, כתובת וקשר.",
      },
      { property: "og:title", content: "הגדרות עסק — חשבונית קלה" },
      { property: "og:description", content: "פרטי העסק שיופיעו על כל מסמך." },
    ],
  }),
  component: SettingsPage,
});

const field =
  "w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30";
const labelCls = "mb-1.5 block text-xs font-semibold text-muted-foreground";

function SettingsPage() {
  const data = useData();
  const [form, setForm] = useState<BusinessInfo | null>(null);

  useEffect(() => {
    if (data && !form) setForm(data.business);
  }, [data, form]);

  if (!form) return <AppShell>טוען…</AppShell>;

  const fields: { key: keyof BusinessInfo; label: string }[] = [
    { key: "name", label: "שם העסק" },
    { key: "taxId", label: "ע.מ / ח.פ" },
    { key: "address", label: "כתובת" },
    { key: "phone", label: "טלפון" },
    { key: "email", label: "דוא״ל" },
    { key: "documentPrefix", label: "קידומת מספור מסמכים" },
  ];

  return (
    <AppShell>
      <h1 className="text-2xl font-bold text-foreground">הגדרות עסק</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        הפרטים האלה מופיעים בראש כל חשבונית וקבלה ונשמרים בענן.
      </p>

      <section className="mt-6 max-w-2xl rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-2">
          {fields.map((f) => (
            <div key={f.key} className={f.key === "address" ? "sm:col-span-2" : ""}>
              <label className={labelCls}>{f.label}</label>
              <input
                className={field}
                value={form[f.key] ?? ""}
                onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
              />
            </div>
          ))}
        </div>
        <button
          onClick={async () => {
            try {
              await actions.saveBusiness(form);
              toast.success("פרטי העסק נשמרו בענן");
            } catch {
              toast.error("אין לך הרשאה לעדכן את פרטי העסק");
            }
          }}
          className="mt-5 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          שמירה
        </button>
      </section>
    </AppShell>
  );
}
