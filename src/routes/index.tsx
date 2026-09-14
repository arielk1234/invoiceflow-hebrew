import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Clock, CheckCircle2, FileEdit, Wallet } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import {
  dateHe,
  money,
  statusLabel,
  totals,
  typeLabel,
  useData,
  type DocStatus,
} from "@/lib/store";
import { StatusBadge } from "@/components/StatusBadge";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "חשבונית קלה — הפקת חשבוניות וקבלות בעברית" },
      {
        name: "description",
        content:
          "מערכת פשוטה להפקת חשבוניות מס וקבלות בעברית: חישוב מע״מ, ניהול לקוחות, מעקב סטטוס והורדת PDF.",
      },
      { property: "og:title", content: "חשבונית קלה — הפקת חשבוניות וקבלות" },
      {
        property: "og:description",
        content: "הפקה מהירה של חשבוניות וקבלות, חישוב מע״מ ומעקב תשלומים.",
      },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const data = useData();
  if (!data) return <AppShell>טוען…</AppShell>;

  const docs = data.docs;
  const sum = (s: DocStatus) =>
    docs.filter((d) => d.status === s).reduce((a, d) => a + totals(d).total, 0);

  const stats = [
    { label: "סה״כ הופק", value: money(docs.reduce((a, d) => a + totals(d).total, 0)), icon: Wallet },
    { label: "ממתין לתשלום", value: money(sum("sent")), icon: Clock },
    { label: "שולם", value: money(sum("paid")), icon: CheckCircle2 },
    { label: "טיוטות", value: String(docs.filter((d) => d.status === "draft").length), icon: FileEdit },
  ];

  const recent = [...docs].slice(0, 6);

  return (
    <AppShell>
      <h1 className="text-2xl font-bold text-foreground">לוח בקרה</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        מבט מהיר על ההכנסות, המסמכים והתשלומים הפתוחים שלך.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{s.label}</span>
              <s.icon className="size-4 text-muted-foreground" />
            </div>
            <p className="mt-3 text-xl font-bold text-foreground">{s.value}</p>
          </div>
        ))}
      </div>

      <section className="mt-8 rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-base font-bold text-foreground">מסמכים אחרונים</h2>
          <Link
            to="/documents"
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            לכל המסמכים
            <ArrowLeft className="size-4" />
          </Link>
        </div>

        {recent.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">
            עדיין אין מסמכים. אפשר להתחיל במסמך חדש.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {recent.map((d) => {
              const client = data.clients.find((c) => c.id === d.clientId);
              return (
                <li key={d.id}>
                  <Link
                    to="/documents/$id"
                    params={{ id: d.id }}
                    className="flex flex-wrap items-center gap-3 px-5 py-3.5 transition hover:bg-secondary/50"
                  >
                    <span className="w-28 text-sm font-semibold text-foreground">
                      {typeLabel[d.type]} {d.number}
                    </span>
                    <span className="flex-1 text-sm text-muted-foreground">
                      {client?.name ?? "—"}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {dateHe(d.issueDate)}
                    </span>
                    <StatusBadge status={d.status} />
                    <span className="w-28 text-left text-sm font-bold text-foreground">
                      {money(totals(d).total)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <p className="mt-6 text-xs text-muted-foreground">
        סטטוסים זמינים: {Object.values(statusLabel).join(" · ")}
      </p>
    </AppShell>
  );
}
