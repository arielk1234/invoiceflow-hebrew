import { useCallback, useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { errorMessage } from "@/lib/error-messages";
import { currentAccessToken } from "@/lib/store";
import type { UniformExportResult } from "@/lib/uniform-format";
import type { FileStatus } from "@/lib/uniform-transmission";
import {
  transmitUniformFile,
  uniformFileStatus,
  type TransmissionResult,
} from "@/lib/uniform-transmission-functions";

type State =
  | { kind: "sending" }
  | { kind: "done"; result: TransmissionResult }
  | { kind: "error"; message: string; notConnected: boolean };

const STATUS_LABEL: Record<FileStatus["status"], string> = {
  Uploaded: "התקבל וממתין לעיבוד",
  Approved: "נקלט ואושר",
  Rejected: "נדחה",
  "": "לא נמצא",
};

/**
 * Transmits the produced files to the Tax Authority as soon as they are
 * produced, as Supplement 1 to the Uniform Format instructions (3.2026) requires.
 */
export function UniformTransmission({
  businessId,
  fromDate,
  toDate,
  result,
}: {
  businessId: string;
  fromDate: string;
  toDate: string;
  result: UniformExportResult;
}) {
  const [state, setState] = useState<State>({ kind: "sending" });
  const [statuses, setStatuses] = useState<FileStatus[] | null>(null);
  const [checking, setChecking] = useState(false);
  // A failed status check keeps the transmission it belongs to, so it never retransmits.
  const [statusError, setStatusError] = useState<string | null>(null);
  // Each produced result is transmitted once, also when React runs effects twice.
  const transmitted = useRef<UniformExportResult | null>(null);
  // Only the latest attempt may update the screen.
  const attempt = useRef(0);

  const transmit = useCallback(async () => {
    const current = ++attempt.current;
    setState({ kind: "sending" });
    setStatuses(null);
    setStatusError(null);
    try {
      const accessToken = await currentAccessToken();
      const outcome = await transmitUniformFile({
        data: {
          businessId,
          accessToken,
          fromDate,
          toDate,
          iniText: result.iniText,
          bkmvdataText: result.bkmvdataText,
        },
      });
      if (current === attempt.current) setState({ kind: "done", result: outcome });
    } catch (error) {
      if (current !== attempt.current) return;
      setState({
        kind: "error",
        notConnected: (error instanceof Error ? error.message : "").includes(
          "ISRAEL_INVOICE_OAUTH_NOT_CONNECTED",
        ),
        message: errorMessage(error, "שידור הקבצים לרשות המסים נכשל"),
      });
    }
  }, [businessId, fromDate, toDate, result]);

  useEffect(() => {
    if (transmitted.current === result) return;
    transmitted.current = result;
    void transmit();
  }, [result, transmit]);

  const checkStatus = async (fileUniqueIds: string[]) => {
    setChecking(true);
    setStatusError(null);
    try {
      const accessToken = await currentAccessToken();
      setStatuses(await uniformFileStatus({ data: { businessId, accessToken, fileUniqueIds } }));
    } catch (error) {
      setStatuses(null);
      setStatusError(errorMessage(error, "לא ניתן לבדוק כרגע את מצב הקליטה ברשות המסים"));
    } finally {
      setChecking(false);
    }
  };

  return (
    <section className="mt-6 rounded-2xl border border-border bg-card p-6 shadow-sm print:hidden">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-secondary text-foreground">
          <Send className="size-5" />
        </span>
        <div>
          <h2 className="text-base font-bold text-foreground">שידור לרשות המסים</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            לפי תוספת מס׳ 1 להוראות להפקת קבצים במבנה אחיד, הקבצים משודרים לרשות המסים מיד עם הפקתם.
          </p>
        </div>
      </div>

      {state.kind === "sending" && (
        <p className="mt-4 text-sm text-muted-foreground">משדר את הקבצים לרשות המסים…</p>
      )}

      {state.kind === "done" && state.result.status === "not_required" && (
        <p className="mt-4 text-sm text-foreground">
          רשות המסים לא דרשה מהעסק קובץ במבנה אחיד לתקופה הזו, ולכן הקבצים לא שודרו. הם נשמרו אצלך,
          ואפשר להוריד אותם למעלה.
        </p>
      )}

      {state.kind === "done" && state.result.status === "transmitted" && (
        <div className="mt-4 text-sm text-foreground">
          <p>
            הקבצים שודרו לרשות המסים. מזהה השידור: <span dir="ltr">{state.result.uniqueId}</span>
          </p>
          <button
            onClick={() =>
              state.result.status === "transmitted" &&
              void checkStatus(state.result.files.map((f) => f.fileUniqueId))
            }
            disabled={checking}
            className="mt-3 rounded-lg border px-4 py-2 disabled:opacity-50"
          >
            {checking ? "בודק…" : "בדיקת מצב הקליטה"}
          </button>
          {statusError && <p className="mt-3 text-destructive">{statusError}</p>}
          {statuses && (
            <ul className="mt-3 space-y-1">
              {state.result.files.map((file) => {
                const status = statuses.find((s) => s.fileUniqueId === file.fileUniqueId);
                return (
                  <li key={file.fileUniqueId}>
                    {file.kind}: {status ? STATUS_LABEL[status.status] : "אין תשובה"}
                    {status?.status === "Rejected" && status.description
                      ? ` (${status.description})`
                      : ""}
                    {status?.errorMessage ? ` (${status.errorMessage})` : ""}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {state.kind === "error" && (
        <div className="mt-4 text-sm">
          {state.notConnected ? (
            <p className="text-foreground">
              העסק לא מחובר לרשות המסים, ולכן הקבצים לא שודרו. בעל העסק או מנהל מחברים אותו ב״הגדרות
              עסק ← חיבור לרשות המסים״, ואחר כך מפיקים את הקבצים שוב.
            </p>
          ) : (
            <p className="text-destructive">{state.message}</p>
          )}
          <button onClick={() => void transmit()} className="mt-3 rounded-lg border px-4 py-2">
            ניסיון חוזר
          </button>
        </div>
      )}
    </section>
  );
}
