import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { ReportFrame } from "@/components/ReportFrame";
import { UniformTransmission } from "@/components/UniformTransmission";
import { useData } from "@/lib/store";
import {
  buildSimulatorFixture,
  buildUniformPrintReport,
  exportUniformFormat,
  openFormatArchive,
  toUniformDownloadBytes,
  validateUniformExportConfig,
  validateUniformExportText,
  type UniformExportConfig,
  type UniformExportResult,
  type UniformPrintReport,
} from "@/lib/uniform-format";

export const Route = createFileRoute("/_authenticated/uniform-export")({
  head: () => ({ meta: [{ title: "הפקת קבצים במבנה אחיד — חשבונית קלה" }] }),
  component: UniformExportPage,
});

const SIMULATOR_URL = "https://www.misim.gov.il/TmbakmmsmlNew/frmCheckFiles.aspx";

const CONFIG_ERRORS: Record<string, string> = {
  INVALID_SOFTWARE_REGISTRATION_NUMBER: "מספר תעודת רישום התוכנה צריך להיות בן 8 ספרות.",
  INVALID_SOFTWARE_NAME: "שם התוכנה חסר או ארוך מ-20 תווים.",
  INVALID_SOFTWARE_VERSION: "מהדורת התוכנה חסרה או ארוכה מ-20 תווים.",
  INVALID_MANUFACTURER_TAX_ID:
    "חסר מספר עוסק מורשה (9 ספרות) של יצרן התוכנה (VITE_UNIFORM_MANUFACTURER_TAX_ID).",
  INVALID_MANUFACTURER_NAME: "חסר שם יצרן התוכנה, עד 20 תווים (VITE_UNIFORM_MANUFACTURER_NAME).",
  BUSINESS_TAX_ID_MUST_BE_9_DIGITS: "מספר העוסק של העסק (בהגדרות העסק) צריך להיות בן 9 ספרות.",
  INVALID_DATE_RANGE: "טווח התאריכים אינו תקין.",
};

function describe(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : "";
  const known = message
    .split(",")
    .map((code) => CONFIG_ERRORS[code])
    .filter(Boolean);
  return known.length ? known.join(" ") : message ? `${fallback} (${message})` : fallback;
}

function download(name: string, bytes: Uint8Array, type: string) {
  const url = URL.createObjectURL(new Blob([bytes.buffer as ArrayBuffer], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

const downloadText = (name: string, text: string) =>
  download(name, toUniformDownloadBytes(text), "text/plain;charset=iso-8859-8");

const ddmmyyyy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

function UniformExportPage() {
  const data = useData();
  const today = new Date().toISOString().slice(0, 10);
  const [fromDate, setFromDate] = useState(`${new Date().getFullYear()}-01-01`);
  const [toDate, setToDate] = useState(today);
  const [error, setError] = useState("");
  const [result, setResult] = useState<UniformExportResult | null>(null);
  // The period the current files were produced for, which is the period transmitted.
  const [producedRange, setProducedRange] = useState({ from: fromDate, to: toDate });
  const [simulator, setSimulator] = useState<ReturnType<typeof buildSimulatorFixture> | null>(null);

  // The software producer's details (the same for every business using the
  // software); the registration number exists only after the Tax Authority
  // registers the software, and is zeros until then.
  const config = useMemo<UniformExportConfig>(
    () => ({
      registrationNumber: import.meta.env.VITE_UNIFORM_SOFTWARE_REGISTRATION_NUMBER || "",
      softwareName: import.meta.env.VITE_UNIFORM_SOFTWARE_NAME || "InvoiceFlow",
      softwareVersion: import.meta.env.VITE_UNIFORM_SOFTWARE_VERSION || "1.0",
      manufacturerTaxId: import.meta.env.VITE_UNIFORM_MANUFACTURER_TAX_ID || "206477515",
      manufacturerName: import.meta.env.VITE_UNIFORM_MANUFACTURER_NAME || "אריאל קלרמן",
      softwareType: 2,
      accountingType: 0,
      compressionProgram: "ZIP",
      hasBranches: false,
    }),
    [],
  );

  if (!data) return <AppShell>טוען…</AppShell>;

  const input = {
    business: data.business,
    clients: data.clients,
    docs: data.docs,
    config,
    fromDate,
    toDate,
  };
  const configErrors = validateUniformExportConfig(config);

  const generate = () => {
    setError("");
    setSimulator(null);
    try {
      const next = exportUniformFormat(input);
      const errors = validateUniformExportText(next);
      if (errors.length) throw new Error(errors.join(","));
      setProducedRange({ from: fromDate, to: toDate });
      setResult(next);
    } catch (e) {
      setResult(null);
      setError(describe(e, "הפקת הקבצים נכשלה"));
    }
  };

  const generateSimulator = () => {
    setError("");
    setResult(null);
    try {
      setSimulator(buildSimulatorFixture(input));
    } catch (e) {
      setSimulator(null);
      setError(describe(e, "הפקת קובץ הבדיקה נכשלה"));
    }
  };

  const report = result ? buildUniformPrintReport(input, result) : null;

  return (
    <AppShell>
      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm print:hidden">
        <h1 className="text-2xl font-bold text-foreground">הפקת קבצים במבנה אחיד</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          לפי ״הוראות להפקת קבצים במבנה אחיד״ גרסה 1.31: INI.TXT ו-BKMVDATA.TXT לטווח תאריכים.
        </p>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <label className="space-y-2">
            <span className="text-sm font-medium">בית העסק</span>
            <input
              value={data.business.name}
              disabled
              className="w-full rounded-lg border bg-muted p-2"
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium">מתאריך</span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full rounded-lg border p-2"
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium">עד תאריך</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full rounded-lg border p-2"
            />
          </label>
        </div>

        {configErrors.length > 0 && (
          <div className="mt-4 rounded-lg border border-border bg-secondary/50 p-3 text-sm text-foreground">
            {configErrors.map((code) => CONFIG_ERRORS[code] ?? code).join(" ")} מגדירים את הפרטים
            האלה ב-Lovable.
          </div>
        )}
        {!config.registrationNumber && (
          <p className="mt-3 text-xs text-muted-foreground">
            עדיין אין לתוכנה תעודת רישום, ולכן בשדה מספר הרישום (1006) נכתב 00000001, כמו בדוגמה של
            רשות המסים לבקשת רישום. אחרי קבלת התעודה מגדירים את המספר ב-
            VITE_UNIFORM_SOFTWARE_REGISTRATION_NUMBER.
          </p>
        )}
        {error && (
          <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            onClick={generate}
            disabled={configErrors.length > 0}
            className="rounded-lg bg-primary px-5 py-2 text-primary-foreground disabled:opacity-50"
          >
            הפקת קבצים
          </button>
          <button
            onClick={generateSimulator}
            disabled={configErrors.length > 0}
            className="rounded-lg border px-5 py-2 disabled:opacity-50"
          >
            קובץ בדיקה לסימולטור
          </button>
        </div>
      </section>

      {simulator && (
        <section className="mt-6 rounded-2xl border border-border bg-card p-6 shadow-sm print:hidden">
          <h2 className="text-xl font-bold">קובץ בדיקה לסימולטור של רשות המסים</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            מסמכי בדיקה מכל הסוגים שהתוכנה מפיקה (חשבונית מס, חשבונית זיכוי, קבלה, כולל מסמכים
            מבוטלים), שהופקו באותו מודול שמפיק את הקבצים האמיתיים.
          </p>
          <div className="mt-4 grid gap-3 text-sm md:grid-cols-3">
            <div>
              רשומות: <b>{simulator.simulatorRecords.toLocaleString("he-IL")}</b>
            </div>
            <div>
              גודל BKMVDATA: <b>{(simulator.simulatorBytes / 1024).toFixed(0)} KB</b>
            </div>
            <div>
              סוגי מסמכים: <b>{simulator.documentTypesCovered.join(", ")}</b>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              onClick={() => downloadText("INI.TXT", simulator.iniText)}
              className="rounded-lg bg-primary px-4 py-2 text-primary-foreground"
            >
              הורדת INI.TXT
            </button>
            <button
              onClick={() => downloadText("BKMVDATA.TXT", simulator.bkmvdataText)}
              className="rounded-lg bg-primary px-4 py-2 text-primary-foreground"
            >
              הורדת BKMVDATA.TXT
            </button>
            <button onClick={() => window.print()} className="rounded-lg border px-4 py-2">
              הדפסת הפלטים 2.6 ו-5.4
            </button>
          </div>
          <ol className="mt-4 list-decimal space-y-1 pr-5 text-sm text-muted-foreground">
            <li>
              פותחים את{" "}
              <a
                href={SIMULATOR_URL}
                target="_blank"
                rel="noreferrer"
                className="text-primary underline"
              >
                הסימולטור של רשות המסים
              </a>
              .
            </li>
            <li>בוחרים סט תווים ״Windows (ANSI) ISO-8859-8-I״.</li>
            <li>מעלים את שני הקבצים ומחכים לסיום הבדיקה.</li>
            <li>שומרים את קובץ התוצאה, ומצרפים אותו לבקשה לרישום התוכנה.</li>
            <li>
              מדפיסים (או שומרים כ-PDF) את הפלטים 2.6 ו-5.4 למטה, <b>מאותה הפקה</b>, ומצרפים אותם
              לבקשה. אם מפיקים קובץ בדיקה חדש, חייבים לבדוק בסימולטור ולהדפיס את הפלטים מחדש.
            </li>
          </ol>
        </section>
      )}

      {simulator && (
        <PrintedReports report={simulator.printReport} producedAt={simulator.generatedAt} />
      )}

      {result && report && (
        <>
          <section className="mt-6 rounded-2xl border border-border bg-card p-6 shadow-sm print:hidden">
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() =>
                  download(
                    `OPENFRMT-${report.businessTaxId}.zip`,
                    openFormatArchive(result),
                    "application/zip",
                  )
                }
                className="rounded-lg bg-primary px-4 py-2 text-primary-foreground"
              >
                הורדת תיקיית OPENFRMT
              </button>
              <button
                onClick={() => downloadText("INI.TXT", result.iniText)}
                className="rounded-lg border px-4 py-2"
              >
                INI.TXT
              </button>
              <button
                onClick={() => downloadText("BKMVDATA.TXT", result.bkmvdataText)}
                className="rounded-lg border px-4 py-2"
              >
                BKMVDATA.TXT
              </button>
              <button onClick={() => window.print()} className="rounded-lg border px-4 py-2">
                הדפסת הדוחות
              </button>
            </div>
          </section>

          <UniformTransmission
            businessId={data.businessId}
            fromDate={producedRange.from}
            toDate={producedRange.to}
            result={result}
          />

          <PrintedReports report={report} producedAt={result.generatedAt} />
        </>
      )}
    </AppShell>
  );
}

/**
 * The two printouts the Tax Authority asks for with the registration request. Both come from
 * the same file as the simulator report, so the C100 counts and totals must agree with it.
 */
function PrintedReports({ report, producedAt }: { report: UniformPrintReport; producedAt: Date }) {
  return (
    <>
      {/* Appendix 4 (section 5.4): the report printed when the files are produced. */}
      <section className="mt-6 rounded-2xl border border-border bg-card p-6 shadow-sm print:border-0 print:shadow-none">
        <h2 className="text-xl font-bold">הפקת קבצים במבנה אחיד</h2>
        <p className="mt-3">מספר עוסק מורשה: {report.businessTaxId}</p>
        <p>שם בית העסק: {report.businessName}</p>
        <p className="mt-3 font-semibold">ביצוע ממשק פתוח הסתיים בהצלחה.</p>
        <p>
          הנתונים נשמרו בנתיב הבא: <span dir="ltr">{report.folder}</span>
        </p>
        <p>
          טווח תאריכים: מתאריך {ddmmyyyy(report.fromDate)} ועד תאריך {ddmmyyyy(report.toDate)}
        </p>

        <p className="mt-5 font-semibold">פירוט סך סוגי הרשומות בקובץ BKMVDATA.TXT:</p>
        <table className="mt-2 w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="border p-2 text-right">קוד רשומה</th>
              <th className="border p-2 text-right">תיאור רשומה</th>
              <th className="border p-2 text-right">סך רשומות</th>
            </tr>
          </thead>
          <tbody>
            {report.records.map((row) => (
              <tr key={row.code}>
                <td className="border p-2">{row.code}</td>
                <td className="border p-2">{row.description}</td>
                <td className="border p-2">{row.count}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-bold">
              <td className="border p-2" colSpan={2}>
                סה״כ
              </td>
              <td className="border p-2">{report.recordsTotal}</td>
            </tr>
          </tfoot>
        </table>

        <p className="mt-5 text-sm">
          הנתונים הופקו באמצעות תוכנת: {report.softwareName} {report.softwareVersion}, מספר תעודת
          הרישום: {report.registrationNumber || "—"}, בתאריך: {report.producedDate}, בשעה:{" "}
          {report.producedTime}.
        </p>
        <p className="mt-6 text-center text-sm font-semibold">*** סוף הפלט ***</p>
      </section>

      {/* Section 2.6: count and total of every document type in appendix 1. */}
      <div className="mt-6 print:break-before-page">
        <ReportFrame
          title="פלט לאימות נתונים: מסמכים לפי סוג"
          businessName={report.businessName}
          taxId={report.businessTaxId}
          period={`${ddmmyyyy(report.fromDate)} – ${ddmmyyyy(report.toDate)}`}
          producedAt={producedAt}
        >
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="border p-2 text-right">מספר המסמך</th>
                <th className="border p-2 text-right">סוג המסמך</th>
                <th className="border p-2 text-right">סה״כ כמותי</th>
                <th className="border p-2 text-right">סה״כ כספי כולל מע״מ (שדה 1223)</th>
              </tr>
            </thead>
            <tbody>
              {report.documents.map((row) => (
                <tr key={row.code}>
                  <td className="border p-2">{row.code}</td>
                  <td className="border p-2">{row.description}</td>
                  <td className="border p-2">{row.count}</td>
                  <td className="border p-2">
                    {row.total.toLocaleString("he-IL", { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ReportFrame>
      </div>
    </>
  );
}
