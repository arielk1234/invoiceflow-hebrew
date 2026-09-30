import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { ReportFrame } from "@/components/ReportFrame";
import { supabase } from "@/integrations/supabase/client";
import { errorMessage } from "@/lib/error-messages";
import { dateHe, money, statusLabel, totals, typeLabel, useData, type Doc } from "@/lib/store";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({ meta: [{ title: "דוחות — חשבונית קלה" }] }),
  component: ReportsPage,
});

type Tab = "register" | "numbering" | "backup";

const TABS: Array<[Tab, string]> = [
  ["register", "רשימת מסמכים שהופקו"],
  ["numbering", "בדיקת רצף מספור"],
  ["backup", "גיבוי"],
];

/** Issued documents in the order they were recorded (appendix H (a)(1)). */
function register(docs: Doc[], from: string, to: string): Doc[] {
  return docs
    .filter((d) => d.status !== "draft" && d.issueDate >= from && d.issueDate <= to)
    .sort(
      (a, b) =>
        (a.issuedAt ?? a.issueDate).localeCompare(b.issuedAt ?? b.issueDate) ||
        a.number.localeCompare(b.number),
    );
}

type SeriesCheck = {
  key: string;
  type: string;
  prefix: string;
  first: number;
  last: number;
  count: number;
  missing: number[];
  reserved: string[];
  duplicates: string[];
};

/** Continuity of the running numbers of each document series (appendix H (a)(5)). */
function numberingCheck(docs: Doc[]): SeriesCheck[] {
  const series = new Map<
    string,
    { type: string; prefix: string; items: Array<{ n: number; doc: Doc }> }
  >();
  for (const doc of docs) {
    const m = /^(.*?)(\d+)$/.exec(doc.number);
    if (!m) continue;
    const key = `${doc.type}|${m[1]}`;
    const entry = series.get(key) ?? { type: typeLabel[doc.type], prefix: m[1]!, items: [] };
    entry.items.push({ n: Number(m[2]), doc });
    series.set(key, entry);
  }
  return [...series.entries()].map(([key, s]) => {
    const numbers = s.items.map((i) => i.n);
    const first = Math.min(...numbers);
    const last = Math.max(...numbers);
    const present = new Set(numbers);
    const missing: number[] = [];
    for (let n = first; n <= last && missing.length < 200; n++)
      if (!present.has(n)) missing.push(n);
    const seen = new Set<number>();
    const duplicates = s.items.filter((i) => (seen.has(i.n) ? true : (seen.add(i.n), false)));
    return {
      key,
      type: s.type,
      prefix: s.prefix,
      first,
      last,
      count: s.items.length,
      missing,
      reserved: s.items.filter((i) => i.doc.status === "draft").map((i) => i.doc.number),
      duplicates: duplicates.map((i) => i.doc.number),
    };
  });
}

/** Reads a whole table in pages (the API returns at most 1,000 rows at a time). */
async function readAll(table: string, businessId: string, columns = "*") {
  const rows: unknown[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from(table as "documents")
      .select(columns)
      .eq("business_id", businessId)
      .range(from, from + 999);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) return rows;
  }
}

function ReportsPage() {
  const data = useData();
  const [tab, setTab] = useState<Tab>("register");
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
  const [from, setFrom] = useState(`${today.slice(0, 4)}-01-01`);
  const [to, setTo] = useState(today);
  const [backingUp, setBackingUp] = useState(false);

  if (!data) return <AppShell>טוען…</AppShell>;
  const { business } = data;
  const period = `${dateHe(from)} – ${dateHe(to)}`;

  // Initiated backup of the accounting data (appendix H (a)(6)).
  const backup = async () => {
    setBackingUp(true);
    try {
      const [clients, documents] = await Promise.all([
        readAll("clients", data.businessId),
        readAll("documents", data.businessId, "*, document_items(*)"),
      ]);
      // Owners and admins also get the audit trail and issued-document snapshots.
      const optional = async (table: string) => {
        try {
          return await readAll(table, data.businessId);
        } catch {
          return null;
        }
      };
      const [auditEvents, documentSnapshots] = await Promise.all([
        optional("audit_events"),
        optional("document_snapshots"),
      ]);
      const payload = {
        format: "invoiceflow-backup",
        version: 1,
        createdAt: new Date().toISOString(),
        business,
        clients,
        documents,
        auditEvents,
        documentSnapshots,
      };
      const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(payload, null, 1)], { type: "application/json" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `invoiceflow-backup-${business.taxId}-${stamp}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`הגיבוי הורד: ${documents.length} מסמכים, ${clients.length} לקוחות`);
    } catch (error) {
      toast.error(errorMessage(error, "הגיבוי נכשל"));
    } finally {
      setBackingUp(false);
    }
  };

  const rows = register(data.docs, from, to);
  const checks = numberingCheck(data.docs);

  return (
    <AppShell>
      <div className="print:hidden">
        <h1 className="text-2xl font-bold text-foreground">דוחות</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          פלטים לפי הוראות ניהול פנקסים (נספח ה׳): רשימת המסמכים שהופקו, בדיקת רצף המספור וגיבוי.
        </p>
        <div className="mt-5 inline-flex rounded-xl bg-secondary p-1">
          {TABS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${tab === key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}
            >
              {label}
            </button>
          ))}
        </div>
        {tab === "register" && (
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="mb-1 block text-xs font-semibold text-muted-foreground">מתאריך</span>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="rounded-lg border p-2"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs font-semibold text-muted-foreground">
                עד תאריך
              </span>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="rounded-lg border p-2"
              />
            </label>
          </div>
        )}
        {tab !== "backup" && (
          <button
            type="button"
            onClick={() => window.print()}
            className="mt-4 rounded-lg border border-input px-4 py-2 text-sm font-semibold text-foreground hover:bg-secondary"
          >
            הדפסה / PDF
          </button>
        )}
      </div>

      <div className="mt-6">
        {tab === "register" && (
          <ReportFrame
            title="רשימת המסמכים שהופקו לפי סדר רישומם"
            businessName={business.name}
            taxId={business.taxId}
            period={period}
          >
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  {[
                    "מס׳ עוקב",
                    "סוג",
                    "מספר",
                    "תאריך",
                    "לקוח",
                    "לפני מע״מ",
                    "מע״מ",
                    "סה״כ",
                    "סטטוס",
                    "מספר הקצאה",
                  ].map((h) => (
                    <th key={h} className="border-b p-2 text-right font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((d, i) => {
                  const t = totals(d);
                  return (
                    <tr key={d.id} className="border-b border-border/60">
                      <td className="p-2">{i + 1}</td>
                      <td className="p-2">{typeLabel[d.type]}</td>
                      <td className="p-2">{d.number}</td>
                      <td className="p-2">{dateHe(d.issueDate)}</td>
                      <td className="p-2">
                        {data.clients.find((c) => c.id === d.clientId)?.name ?? "—"}
                      </td>
                      <td className="p-2">{money(d.subtotal ?? t.subtotal)}</td>
                      <td className="p-2">{money(d.vatAmount ?? t.vat)}</td>
                      <td className="p-2">{money(d.totalAmount ?? t.total)}</td>
                      <td className="p-2">{statusLabel[d.status]}</td>
                      <td className="p-2">{d.allocationNumber?.slice(-9) ?? ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {rows.length === 0 && (
              <p className="p-4 text-center text-sm text-muted-foreground">אין מסמכים בתקופה.</p>
            )}
          </ReportFrame>
        )}

        {tab === "numbering" && (
          <ReportFrame
            title="בדיקת רצף המספרים העוקבים של המסמכים"
            businessName={business.name}
            taxId={business.taxId}
            period="כל המסמכים"
          >
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  {["סוג מסמך", "סדרה", "מספר ראשון", "מספר אחרון", "מסמכים", "תוצאה"].map((h) => (
                    <th key={h} className="border-b p-2 text-right font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {checks.map((c) => (
                  <tr key={c.key} className="border-b border-border/60 align-top">
                    <td className="p-2">{c.type}</td>
                    <td className="p-2" dir="ltr">
                      {c.prefix || "—"}
                    </td>
                    <td className="p-2">{c.first}</td>
                    <td className="p-2">{c.last}</td>
                    <td className="p-2">{c.count}</td>
                    <td className="p-2">
                      {c.missing.length === 0 && c.duplicates.length === 0 ? (
                        <span className="font-semibold text-primary">רצף תקין</span>
                      ) : (
                        <span className="font-semibold text-destructive">
                          {c.missing.length > 0 && `חסרים: ${c.missing.join(", ")}. `}
                          {c.duplicates.length > 0 && `כפולים: ${c.duplicates.join(", ")}.`}
                        </span>
                      )}
                      {c.reserved.length > 0 && (
                        <span className="block text-xs text-muted-foreground">
                          שמורים לטיוטות שנשלחו לרשות המסים: {c.reserved.join(", ")}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {checks.length === 0 && (
              <p className="p-4 text-center text-sm text-muted-foreground">
                עדיין אין מסמכים ממוספרים.
              </p>
            )}
          </ReportFrame>
        )}

        {tab === "backup" && (
          <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <h2 className="text-xl font-bold text-foreground">גיבוי יזום</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              קובץ אחד עם כל נתוני העסק: פרטי העסק, לקוחות, מסמכים ושורות החיוב שלהם, ולבעלים
              ולמנהלים גם יומן הפעולות ותמונות המסמכים שהופקו. את הקובץ שומרים במקום בטוח מחוץ
              למערכת. בנוסף, הנתונים בענן מגובים אוטומטית.
            </p>
            <button
              type="button"
              onClick={() => void backup()}
              disabled={backingUp}
              className="mt-5 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {backingUp ? "מכין גיבוי…" : "הורדת גיבוי מלא"}
            </button>
          </section>
        )}
      </div>
    </AppShell>
  );
}
