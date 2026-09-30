import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { errorMessage } from "@/lib/error-messages";
import type { AllocationDecision } from "@/lib/israel-invoice-api";
import { actions, type Doc } from "@/lib/store";

// The alternatives the Tax Authority requires software to offer when it holds
// an invoice (Israel Invoice API document, edition 2.0, sections 2.2.2 and 4).
const OPTIONS: Array<{ decision: AllocationDecision; title: string; description: string }> = [
  {
    decision: "continue",
    title: "להמשיך בלי מספר הקצאה",
    description: "החשבונית תופק, ויודפס עליה בבירור: ״אין לנכות מס תשומות בגין חשבונית זו״.",
  },
  {
    decision: "cancel",
    title: "לבטל את החשבונית",
    description: "החשבונית תירשם כמבוטלת, והמספר שלה יישאר ברישומים.",
  },
  {
    decision: "further_objection",
    title: "לבקש שימוע",
    description:
      "את בקשת השימוע מגישים ברשות המסים. אם החשבונית תאושר, אפשר לבקש שוב מספר הקצאה בכפתור ״הפק מסמך״.",
  },
];

const SUCCESS: Record<AllocationDecision, string> = {
  continue: "החשבונית הופקה בלי מספר הקצאה",
  cancel: "החשבונית נרשמה כמבוטלת",
  further_objection: "ההחלטה נשלחה לרשות המסים",
};

const panel = "mb-6 rounded-2xl border p-5 print:hidden";

export function AllocationDecisionPanel({ doc, canDecide }: { doc: Doc; canDecide: boolean }) {
  const [sending, setSending] = useState<AllocationDecision | null>(null);

  if (doc.allocationDecision === "further_objection") {
    return (
      <section className={`${panel} border-border bg-secondary/50 text-sm text-foreground`}>
        נשלחה לרשות המסים בקשה לשימוע על חשבונית זו. אם החשבונית תאושר, לחצו ״הפק מסמך״ כדי לבקש שוב
        מספר הקצאה.
      </section>
    );
  }

  if (doc.allocationDecision) {
    return (
      <section className={`${panel} border-border bg-secondary/50 text-sm text-foreground`}>
        ההחלטה נשלחה לרשות המסים. לחצו ״הפק מסמך״ כדי להשלים את הפקת החשבונית.
      </section>
    );
  }

  if (doc.allocationHoldCode === 462) {
    return (
      <section className={`${panel} border-border bg-secondary/50 text-sm text-foreground`}>
        רשות המסים לא אישרה את החשבונית, וכבר נשלחה לרשות החלטה לגביה. אין צורך בפעולה נוספת מול
        הרשות.
      </section>
    );
  }

  const decide = async (option: (typeof OPTIONS)[number]) => {
    if (
      !window.confirm(`לשלוח לרשות המסים את ההחלטה ״${option.title}״? אי אפשר לשנות אותה אחר כך.`)
    ) {
      return;
    }
    setSending(option.decision);
    try {
      await actions.decideHeldInvoice(doc.id, option.decision);
      toast.success(SUCCESS[option.decision]);
    } catch (error) {
      toast.error(errorMessage(error, "שליחת ההחלטה לרשות המסים נכשלה"));
    } finally {
      setSending(null);
    }
  };

  return (
    <section className={`${panel} border-destructive/30 bg-destructive/5`}>
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
        <div>
          <h2 className="text-base font-bold text-foreground">
            רשות המסים לא אישרה מספר הקצאה לחשבונית זו
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            לפי הנחיות רשות המסים צריך לבחור איך להמשיך. הבחירה נשלחת לרשות המסים.
          </p>
          {!canDecide && (
            <p className="mt-2 text-sm font-medium text-foreground">
              רק בעלים או מנהל של העסק יכולים לבחור.
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {OPTIONS.map((option) => (
          <button
            key={option.decision}
            type="button"
            disabled={!canDecide || sending !== null}
            onClick={() => void decide(option)}
            className="rounded-xl border border-border bg-card p-4 text-right transition hover:border-ring disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="block text-sm font-bold text-foreground">
              {sending === option.decision ? "שולח לרשות המסים…" : option.title}
            </span>
            <span className="mt-1 block text-xs text-muted-foreground">{option.description}</span>
          </button>
        ))}
        <div className="rounded-xl border border-dashed border-border p-4 text-right">
          <span className="block text-sm font-bold text-muted-foreground">היפוך חיוב</span>
          <span className="mt-1 block text-xs text-muted-foreground">
            דורש את הסכמת הלקוח והפקת חשבונית בשיעור אפס. עדיין לא נתמך במערכת, ואפשר לטפל בזה עם
            רואה החשבון.
          </span>
        </div>
      </div>
    </section>
  );
}
