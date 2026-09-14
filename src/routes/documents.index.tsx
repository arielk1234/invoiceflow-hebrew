import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { StatusBadge } from "@/components/StatusBadge";
import { dateHe, money, totals, typeLabel, useData, type DocStatus } from "@/lib/store";

export const Route = createFileRoute("/documents")({
  head: () => ({
    meta: [
      { title: "מסמכים — חשבונית קלה" },
      {
        name: "description",
        content: "כל החשבוניות והקבלות במקום אחד, עם סינון לפי סטטוס וחיפוש לקוח.",
      },
      { property: "og:title", content: "מסמכים — חשבונית קלה" },
      {
        property: "og:description",
        content: "ניהול חשבוניות וקבלות עם מעקב סטטוס תשלום.",
      },
    ],
  }),
  component: DocumentsPage,
});

const filters: { key: DocStatus | "all"; label: string }[] = [
  { key: "all", label: "הכול" },
  { key: "draft", label: "טיוטה" },
  { key: "sent", label: "נשלח" },
  { key: "paid", label: "שולם" },
];

function DocumentsPage() {
  const data = useData();
  const [status, setStatus] = useState<DocStatus | "all">("all");
  const [q, setQ] = useState("");

  if (!data) return <AppShell>טוען…</AppShell>;

  const list = data.docs.filter((d) => {
    const client = data.clients.find((c) => c.id === d.clientId);
    const matchStatus = status === "all" || d.status === status;
    const matchQ =
      !q ||
      d.number.includes(q) ||
      (client?.name ?? "").includes(q) ||
      d.items.some((i) => i.description.includes(q));
    return matchStatus && matchQ;
  });

  return (
    <AppShell>
      <h1 className="text-2xl font-bold text-foreground">מסמכים</h1>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-xl bg-secondary p-1">
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => setStatus(f.key)}
              className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${
                status === f.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="חיפוש לפי לקוח, מספר או פריט"
            className="w-full rounded-lg border border-input bg-card py-2 pr-9 pl-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
          />
        </div>
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        {list.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            לא נמצאו מסמכים תואמים.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {list.map((d) => {
              const client = data.clients.find((c) => c.id === d.clientId);
              return (
                <li key={d.id}>
                  <Link
                    to="/documents/$id"
                    params={{ id: d.id }}
                    className="flex flex-wrap items-center gap-3 px-5 py-4 transition hover:bg-secondary/50"
                  >
                    <span className="w-32 text-sm font-semibold text-foreground">
                      {typeLabel[d.type]} {d.number}
                    </span>
                    <span className="flex-1 text-sm text-muted-foreground">
                      {client?.name ?? "—"}
                    </span>
                    <span className="text-sm text-muted-foreground">{dateHe(d.issueDate)}</span>
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
      </div>
    </AppShell>
  );
}
