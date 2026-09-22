import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useData } from "@/lib/store";
import {
  buildUniformPrintReport,
  buildSimulatorFixture,
  exportUniformFormat,
  toUniformDownloadBytes,
  validateUniformExportText,
} from "@/lib/uniform-format";

export const Route = createFileRoute("/_authenticated/uniform-export" as any)({
  component: UniformExportPage,
});

function UniformExportPage() {
  const data = useData();
  const today = new Date().toISOString().slice(0, 10);
  const [fromDate, setFromDate] = useState(`${new Date().getFullYear()}-01-01`);
  const [toDate, setToDate] = useState(today);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ReturnType<typeof exportUniformFormat> | null>(null);
  const [simulator, setSimulator] = useState<ReturnType<typeof buildSimulatorFixture> | null>(null);

  const config = useMemo(() => ({
    registrationNumber: import.meta.env.VITE_UNIFORM_SOFTWARE_REGISTRATION_NUMBER || "",
    softwareName: import.meta.env.VITE_UNIFORM_SOFTWARE_NAME || "InvoiceFlow",
    softwareVersion: import.meta.env.VITE_UNIFORM_SOFTWARE_VERSION || "1.0",
    manufacturerTaxId: import.meta.env.VITE_UNIFORM_MANUFACTURER_TAX_ID || "",
    manufacturerName: import.meta.env.VITE_UNIFORM_MANUFACTURER_NAME || "",
    softwareType: 2 as const,
    accountingType: 0 as const,
    compressionProgram: "ZIP",
    hasBranches: false,
  }), []);

  if (!data) return <main dir="rtl" className="p-8">טוען...</main>;

  const generate = () => {
    setError("");
    try {
      if (!/^\d{8}$/.test(config.registrationNumber)) throw new Error("יש להגדיר מספר תעודת רישום תוכנה בן 8 ספרות.");
      if (!/^\d{9}$/.test(config.manufacturerTaxId)) throw new Error("יש להגדיר מספר עוסק מורשה של יצרן התוכנה בן 9 ספרות.");
      if (!config.manufacturerName) throw new Error("יש להגדיר שם יצרן תוכנה.");
      if (fromDate > toDate) throw new Error("טווח התאריכים אינו תקין.");

      const next = exportUniformFormat({
        business: data.business,
        clients: data.clients,
        docs: data.docs,
        config,
        fromDate,
        toDate,
      });
      const errors = validateUniformExportText(next);
      if (errors.length) throw new Error(`אימות מבני נכשל: ${errors.join(", ")}`);
      setResult(next);
      setSimulator(null);
    } catch (e) {
      setResult(null);
      setError(e instanceof Error ? e.message : "שגיאה בהפקת הקובץ");
    }
  };

  const generateSimulator = () => {
    setError("");
    try {
      if (!/^\d{8}$/.test(config.registrationNumber)) throw new Error("יש להגדיר מספר תעודת רישום תוכנה בן 8 ספרות.");
      if (!/^\d{9}$/.test(config.manufacturerTaxId)) throw new Error("יש להגדיר מספר עוסק מורשה של יצרן התוכנה בן 9 ספרות.");
      if (!config.manufacturerName) throw new Error("יש להגדיר שם יצרן תוכנה.");
      const next = buildSimulatorFixture({
        business: data.business,
        clients: data.clients,
        docs: [],
        config,
        fromDate,
        toDate,
      });
      setSimulator(next);
      setResult(null);
    } catch (e) {
      setSimulator(null);
      setError(e instanceof Error ? e.message : "שגיאה בהפקת קובץ הסימולטור");
    }
  };

  const download = (name: string, text: string) => {
    const blob = new Blob([toUniformDownloadBytes(text).buffer as ArrayBuffer], { type: "text/plain;charset=iso-8859-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const report = result ? buildUniformPrintReport({
    business: data.business,
    clients: data.clients,
    docs: data.docs,
    config,
    fromDate,
    toDate,
  }, result) : null;

  return (
    <main dir="rtl" className="mx-auto max-w-6xl space-y-6 p-6">
      <section className="rounded-2xl border bg-background p-6 shadow-sm">
        <h1 className="text-2xl font-bold">הפקת קבצים במבנה אחיד</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Uniform Format 1.31 · הפקת INI.TXT ו-BKMVDATA.TXT לפי טווח תאריכים.
        </p>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <label className="space-y-2">
            <span className="text-sm font-medium">בית העסק</span>
            <input value={data.business.name} disabled className="w-full rounded-lg border bg-muted p-2" />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium">מתאריך</span>
            <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="w-full rounded-lg border p-2" />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium">עד תאריך</span>
            <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="w-full rounded-lg border p-2" />
          </label>
        </div>

        {error && <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}

        <div className="mt-6 flex flex-wrap gap-3"><button onClick={generate} className="rounded-lg bg-primary px-5 py-2 text-primary-foreground">הפק קבצים</button><button onClick={generateSimulator} className="rounded-lg border px-5 py-2">הפק קובץ בדיקה לסימולטור</button></div>
      </section>

      {simulator && (
        <section className="rounded-2xl border bg-background p-6 shadow-sm">
          <h2 className="text-xl font-bold">קובץ בדיקה לסימולטור רשות המסים</h2>
          <p className="mt-2 text-sm text-muted-foreground">נוצר קובץ 1.31 סינתטי לבדיקת מבנה בלבד, הכולל את כל סוגי המסמכים שבנספח 1, רשומות הנהלת חשבונות ומלאי.</p>
          <div className="mt-4 grid gap-3 md:grid-cols-3 text-sm"><div>רשומות: <b>{simulator.simulatorRecords}</b></div><div>גודל: <b>{(simulator.simulatorBytes / 1024).toFixed(1)} KB</b></div><div>סוגי מסמכים: <b>{simulator.documentTypesCovered.length}</b></div></div>
          <button onClick={() => download("BKMVDATA-SIMULATOR-1.31.TXT", simulator.bkmvdataText)} className="mt-5 rounded-lg bg-primary px-4 py-2 text-primary-foreground">הורד קובץ לסימולטור</button>
          <p className="mt-3 text-xs text-muted-foreground">הסימולטור הרשמי מקבל קובץ בגרסה 1.31 עם לפחות 2,000 רשומות ועד 4MB. לאחר הבדיקה יש לשמור את קובץ תוצאת הסימולטור לצורך ההגשה.</p>
        </section>
      )}

      {result && report && (
        <>
          <section className="rounded-2xl border bg-background p-6 shadow-sm">
            <div className="flex flex-wrap gap-3">
              <button onClick={() => download("INI.TXT", result.iniText)} className="rounded-lg border px-4 py-2">הורד INI.TXT</button>
              <button onClick={() => download("BKMVDATA.TXT", result.bkmvdataText)} className="rounded-lg border px-4 py-2">הורד BKMVDATA.TXT</button>
              <button onClick={() => window.print()} className="rounded-lg bg-primary px-4 py-2 text-primary-foreground">הדפס דוח אימות</button>
            </div>
            <div className="mt-4 text-sm">
              <b>מזהה הפקה:</b> {result.primaryId} · <b>רשומות:</b> {result.bkmvdataText.split("\r\n").filter(Boolean).length}
            </div>
          </section>

          <section className="rounded-2xl border bg-background p-6 shadow-sm print:shadow-none">
            <h2 className="text-xl font-bold">דוח הפקת קבצים במבנה אחיד</h2>
            <p className="mt-3">מספר עוסק מורשה: {report.businessTaxId}</p>
            <p>שם בית העסק: {report.businessName}</p>
            <p>טווח: {report.fromDate} עד {report.toDate}</p>
            <p className="mt-3">מלל קבוע: ביצוע ממשק פתוח הסתיים בהצלחה.</p><p>נתיב לוגי לפי ההנחיות: OPENFRMT\\{report.businessTaxId.slice(0, 8)}.{String(new Date(report.generatedAt).getFullYear()).slice(-2)}</p>

            <table className="mt-6 w-full border-collapse text-sm">
              <thead><tr><th className="border p-2 text-right">קוד</th><th className="border p-2 text-right">תיאור</th><th className="border p-2 text-right">סך רשומות</th><th className="border p-2 text-right">סך כספי</th></tr></thead>
              <tbody>
                {Object.entries(result.recordCounts).map(([code, count]) => (
                  <tr key={code}><td className="border p-2">{code}</td><td className="border p-2">{code}</td><td className="border p-2">{count}</td><td className="border p-2">—</td></tr>
                ))}
              </tbody>
            </table>

            <h3 className="mt-8 text-lg font-bold">פירוט סוגי המסמכים</h3>
            <table className="mt-3 w-full border-collapse text-sm">
              <thead><tr><th className="border p-2 text-right">מספר המסמך</th><th className="border p-2 text-right">סוג המסמך</th><th className="border p-2 text-right">סה"כ כמותי</th><th className="border p-2 text-right">סה"כ כספי (₪)</th></tr></thead>
              <tbody>
                {report.documents.map(row => (
                  <tr key={row.code}><td className="border p-2">{row.code}</td><td className="border p-2">{row.description}</td><td className="border p-2">{row.count}</td><td className="border p-2">{row.total.toFixed(2)}</td></tr>
                ))}
              </tbody>
            </table>

            <p className="mt-6 text-sm">
              הנתונים הופקו באמצעות תוכנת {report.softwareName}, מהדורה {report.softwareVersion},
              מספר תעודת רישום: {report.registrationNumber}.
            </p>
          </section>
        </>
      )}
    </main>
  );
}
