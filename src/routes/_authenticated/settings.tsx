import { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CheckCircle2, Landmark, XCircle } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { errorMessage } from "@/lib/error-messages";
import { STANDARD_VAT_RATE } from "@/lib/israel-compliance";
import {
  getIsraelInvoiceConnectionStatus,
  startIsraelInvoiceOAuth,
  type IsraelInvoiceConnectionStatus,
  type IsraelInvoiceSetupStatus,
} from "@/lib/israel-invoice-connection";
import { actions, currentAccessToken, dateHe, useData, type BusinessInfo } from "@/lib/store";

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

const businessTypeLabel: Record<BusinessInfo["businessType"], string> = {
  osek_patur: "עוסק פטור",
  osek_murshe: "עוסק מורשה",
  company: "חברה בע״מ",
};

function SettingsPage() {
  const data = useData();
  const [form, setForm] = useState<BusinessInfo | null>(null);

  useEffect(() => {
    if (data && !form) setForm(data.business);
  }, [data, form]);

  useTaxAuthorityReturnToast();

  if (!data || !form) return <AppShell>טוען…</AppShell>;

  const canManageTaxAuthority = data.role === "owner" || data.role === "admin";

  const fields: {
    key: "name" | "taxId" | "address" | "phone" | "email" | "documentPrefix";
    label: string;
  }[] = [
    { key: "name", label: "שם העסק" },
    { key: "taxId", label: "ע.מ / ח.פ" },
    { key: "address", label: "כתובת" },
    { key: "phone", label: "טלפון" },
    { key: "email", label: "דוא״ל" },
    { key: "documentPrefix", label: "קידומת מספור מסמכים" },
  ];

  const setBusinessType = (businessType: BusinessInfo["businessType"]) =>
    setForm({
      ...form,
      businessType,
      // An exempt business charges no VAT; restore the standard rate when leaving that status.
      vatRate:
        businessType === "osek_patur" ? 0 : form.vatRate === 0 ? STANDARD_VAT_RATE : form.vatRate,
    });

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
          <div>
            <label className={labelCls}>סוג עוסק</label>
            <select
              className={field}
              value={form.businessType}
              onChange={(e) => setBusinessType(e.target.value as BusinessInfo["businessType"])}
            >
              {Object.entries(businessTypeLabel).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>שיעור מע״מ ברירת מחדל (%)</label>
            <input
              type="number"
              min={0}
              max={100}
              step="0.5"
              className={field}
              value={form.vatRate}
              disabled={form.businessType === "osek_patur"}
              onChange={(e) => setForm({ ...form, vatRate: Number(e.target.value) })}
            />
          </div>
        </div>
        {form.businessType === "osek_patur" && (
          <p className="mt-3 text-xs text-muted-foreground">
            עוסק פטור אינו גובה מע״מ ומפיק קבלות בלבד.
          </p>
        )}
        <button
          onClick={async () => {
            try {
              await actions.saveBusiness(form);
              toast.success("פרטי העסק נשמרו בענן");
            } catch (error) {
              toast.error(errorMessage(error, "שמירת פרטי העסק נכשלה"));
            }
          }}
          className="mt-5 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          שמירה
        </button>
      </section>

      {canManageTaxAuthority && <TaxAuthorityConnection businessId={data.businessId} />}
    </AppShell>
  );
}

/** Shows the result when the Tax Authority OAuth callback sends the user back here. */
function useTaxAuthorityReturnToast() {
  const navigate = useNavigate();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    const result = new URLSearchParams(window.location.search).get("tax_authority");
    if (!result) return;
    handled.current = true;

    if (result === "connected") toast.success("החיבור לרשות המסים הושלם");
    else if (result === "denied") toast.error("החיבור לרשות המסים בוטל באתר רשות המסים");
    else toast.error("החיבור לרשות המסים נכשל. אפשר לנסות שוב.");

    void navigate({ to: "/settings", replace: true });
  }, [navigate]);
}

function TaxAuthorityConnection({ businessId }: { businessId: string }) {
  const [status, setStatus] = useState<IsraelInvoiceConnectionStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const accessToken = await currentAccessToken();
        const result = await getIsraelInvoiceConnectionStatus({
          data: { businessId, accessToken },
        });
        if (!cancelled) setStatus(result);
      } catch (error) {
        if (!cancelled)
          setLoadError(errorMessage(error, "לא ניתן לבדוק כרגע את מצב החיבור לרשות המסים"));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [businessId]);

  const connect = async () => {
    setConnecting(true);
    try {
      const accessToken = await currentAccessToken();
      const { authorizationUrl } = await startIsraelInvoiceOAuth({
        data: { businessId, accessToken },
      });
      window.location.assign(authorizationUrl);
    } catch (error) {
      toast.error(errorMessage(error, "לא ניתן להתחיל את החיבור לרשות המסים"));
      setConnecting(false);
    }
  };

  return (
    <section className="mt-6 max-w-2xl rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-secondary text-foreground">
            <Landmark className="size-5" />
          </span>
          <div>
            <h2 className="text-base font-bold text-foreground">חיבור לרשות המסים</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              נדרש כדי לבקש מספרי הקצאה (חשבוניות ישראל) לחשבוניות מעל הסף.
            </p>
            {status && (
              <p className="mt-2 text-xs text-muted-foreground">
                סביבה: {status.environment === "production" ? "ייצור" : "בדיקות (Sandbox)"}
              </p>
            )}
          </div>
        </div>

        {status &&
          (status.connected ? (
            <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
              מחובר{status.connectedAt ? ` מאז ${dateHe(status.connectedAt)}` : ""}
            </span>
          ) : (
            <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-muted-foreground">
              לא מחובר
            </span>
          ))}
      </div>

      {loadError && <p className="mt-4 text-sm text-destructive">{loadError}</p>}
      {!status && !loadError && (
        <p className="mt-4 text-sm text-muted-foreground">בודק את מצב החיבור…</p>
      )}
      {status?.statusError && (
        <p className="mt-4 text-sm text-destructive">
          {errorMessage(
            { message: status.statusError },
            "לא ניתן לבדוק כרגע את מצב החיבור לרשות המסים",
          )}
        </p>
      )}
      {status && <SetupChecklist setup={status.setup} />}

      <button
        onClick={() => void connect()}
        disabled={connecting || !status || !setupReady(status.setup)}
        className="mt-5 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {connecting
          ? "מעביר לרשות המסים…"
          : status?.connected
            ? "חיבור מחדש"
            : "התחברות לרשות המסים"}
      </button>
    </section>
  );
}

const CALLBACK_PATH = "/api/israel-invoice/oauth/callback";

const SETUP_ITEMS: Array<{ key: keyof IsraelInvoiceSetupStatus["checks"]; label: string }> = [
  { key: "clientId", label: "מזהה האפליקציה מפורטל המפתחים (ISRAEL_INVOICE_CLIENT_ID)" },
  { key: "clientSecret", label: "הסוד של האפליקציה (ISRAEL_INVOICE_CLIENT_SECRET)" },
  { key: "scope", label: "הרשאת הגישה (ISRAEL_INVOICE_SCOPE, בדוגמאות הרשמיות: scope)" },
  { key: "redirectUri", label: "כתובת החזרה (ISRAEL_INVOICE_REDIRECT_URI)" },
  { key: "stateSecret", label: "סוד לאבטחת ההתחברות (ISRAEL_INVOICE_OAUTH_STATE_SECRET)" },
  {
    key: "encryptionKey",
    label: "מפתח הצפנה של 32 בתים ב-base64 (ISRAEL_INVOICE_TOKEN_ENCRYPTION_KEY)",
  },
  { key: "serviceRoleKey", label: "מפתח השרת של Supabase (SUPABASE_SERVICE_ROLE_KEY)" },
];

const setupReady = (setup: IsraelInvoiceSetupStatus) => Object.values(setup.checks).every(Boolean);

/** What is still missing on the server, and the redirect URI to register with the Tax Authority. */
function SetupChecklist({ setup }: { setup: IsraelInvoiceSetupStatus }) {
  const expectedRedirect = `${window.location.origin}${CALLBACK_PATH}`;
  const redirectMismatch = setup.redirectUri !== null && setup.redirectUri !== expectedRedirect;
  const ready = setupReady(setup);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(expectedRedirect);
      toast.success("הכתובת הועתקה");
    } catch {
      toast.error("לא ניתן להעתיק. אפשר לסמן את הכתובת ולהעתיק ידנית.");
    }
  };

  return (
    <div className="mt-4 rounded-xl bg-secondary/50 p-4 text-sm">
      <p className="font-semibold text-foreground">
        {ready ? "הגדרות השרת מוכנות" : "הגדרות שחסרות בשרת (Secrets ב-Lovable)"}
      </p>
      {!ready && (
        <ul className="mt-2 space-y-1.5">
          {SETUP_ITEMS.map((item) => (
            <li key={item.key} className="flex items-start gap-2">
              {setup.checks[item.key] ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
              ) : (
                <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
              )}
              <span className="text-muted-foreground">{item.label}</span>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-3 text-xs text-muted-foreground">
        כתובת ההחזרה שצריך לרשום באפליקציה בפורטל המפתחים של רשות המסים:
      </p>
      <div className="mt-1 flex items-center gap-2">
        <code dir="ltr" className="min-w-0 flex-1 truncate rounded bg-card px-2 py-1 text-xs">
          {expectedRedirect}
        </code>
        <button
          type="button"
          onClick={() => void copy()}
          className="shrink-0 rounded-lg border border-input px-3 py-1 text-xs font-medium text-foreground hover:bg-secondary"
        >
          העתקה
        </button>
      </div>
      {redirectMismatch && (
        <p className="mt-2 text-xs text-destructive">
          בשרת מוגדרת כתובת אחרת:{" "}
          <code dir="ltr" className="break-all">
            {setup.redirectUri}
          </code>
          . אם באתר הזה משתמשים באפליקציה, צריך לעדכן אותה גם בשרת וגם בפורטל.
        </p>
      )}
      {setup.softwareRegistrationNumberValid === false && (
        <p className="mt-2 text-xs text-destructive">
          מספר רישום התוכנה (ISRAEL_INVOICE_SOFTWARE_REGISTRATION_NUMBER) צריך להיות בן 8 או 9
          ספרות.
        </p>
      )}
    </div>
  );
}
