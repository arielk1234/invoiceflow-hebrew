import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { FileText, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "כניסה והרשמה — חשבונית קלה" },
      {
        name: "description",
        content:
          "התחברות או פתיחת חשבון חדש במערכת חשבונית קלה להפקת חשבוניות וקבלות בעברית.",
      },
      { property: "og:title", content: "כניסה והרשמה — חשבונית קלה" },
      {
        property: "og:description",
        content: "כניסה לחשבון או הרשמה מהירה למערכת החשבוניות והקבלות.",
      },
    ],
  }),
  component: AuthPage,
});

const field =
  "w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30";
const labelCls = "mb-1.5 block text-xs font-semibold text-muted-foreground";

const businessTypes = [
  { value: "osek_patur", label: "עוסק פטור" },
  { value: "osek_murshe", label: "עוסק מורשה" },
  { value: "company", label: "חברה בע״מ" },
] as const;

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [businessType, setBusinessType] =
    useState<(typeof businessTypes)[number]["value"]>("osek_patur");
  const [taxId, setTaxId] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/", replace: true });
    });
  }, [navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("ברוך שובך!");
        navigate({ to: "/", replace: true });
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: {
              full_name: fullName,
              business_name: businessName,
              business_type: businessType,
              tax_id: taxId,
            },
          },
        });
        if (error) throw error;
        if (data.session) {
          toast.success("החשבון נוצר בהצלחה");
          navigate({ to: "/", replace: true });
        } else {
          toast.success("שלחנו מייל אימות — יש לאשר אותו כדי להיכנס");
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "אירעה שגיאה, נסו שוב");
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    setBusy(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      setBusy(false);
      toast.error("הכניסה עם גוגל נכשלה");
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/", replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2">
          <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground">
            <FileText className="size-5" />
          </span>
          <span className="text-xl font-bold tracking-tight text-foreground">
            חשבונית קלה
          </span>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-secondary p-1">
            {(["signin", "signup"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                  mode === m
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground"
                }`}
              >
                {m === "signin" ? "התחברות" : "הרשמה"}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="grid gap-4">
            {mode === "signup" && (
              <>
                <div>
                  <label className={labelCls}>שם מלא</label>
                  <input
                    className={field}
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className={labelCls}>שם העסק</label>
                  <input
                    className={field}
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    required
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className={labelCls}>סוג עוסק</label>
                    <select
                      className={field}
                      value={businessType}
                      onChange={(e) =>
                        setBusinessType(
                          e.target.value as (typeof businessTypes)[number]["value"],
                        )
                      }
                    >
                      {businessTypes.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>ע.מ / ח.פ</label>
                    <input
                      className={field}
                      value={taxId}
                      onChange={(e) => setTaxId(e.target.value)}
                      required
                    />
                  </div>
                </div>
              </>
            )}

            <div>
              <label className={labelCls}>דוא״ל</label>
              <input
                type="email"
                dir="ltr"
                className={field}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <label className={labelCls}>סיסמה</label>
              <input
                type="password"
                dir="ltr"
                className={field}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
                required
              />
            </div>

            <button
              type="submit"
              disabled={busy}
              className="mt-1 inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
            >
              {busy && <Loader2 className="size-4 animate-spin" />}
              {mode === "signin" ? "כניסה" : "יצירת חשבון"}
            </button>
          </form>

          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            או
            <span className="h-px flex-1 bg-border" />
          </div>

          <button
            type="button"
            onClick={handleGoogle}
            disabled={busy}
            className="w-full rounded-lg border border-input bg-card px-5 py-2.5 text-sm font-semibold text-foreground transition hover:bg-secondary disabled:opacity-60"
          >
            המשך עם Google
          </button>
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          בהרשמה את/ה מאשר/ת שהפרטים ישמשו להפקת המסמכים שלך בלבד.
        </p>
      </div>
    </div>
  );
}
