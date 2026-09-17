import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { DocEditor } from "@/components/DocEditor";
import { emptyDoc, useData } from "@/lib/store";

export const Route = createFileRoute("/_authenticated/documents/new")({
  head: () => ({
    meta: [
      { title: "מסמך חדש — חשבונית קלה" },
      { name: "description", content: "יצירת חשבונית מס, קבלה או חשבונית זיכוי עם חישוב מע״מ אוטומטי והפקה מבוקרת." },
      { property: "og:title", content: "מסמך חדש — חשבונית קלה" },
      { property: "og:description", content: "הפקת מסמך חשבונאי בכמה קליקים." },
    ],
  }),
  component: NewDocPage,
});

function NewDocPage() {
  const data = useData();
  if (!data) return <AppShell>טוען…</AppShell>;

  return (
    <AppShell>
      <h1 className="text-2xl font-bold text-foreground">מסמך חדש</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">
        טיוטות אינן מקבלות מספר סופי. המספר מוקצה רק בעת הפקת המסמך בשרת.
      </p>
      <DocEditor key={data.docs.length} initial={emptyDoc("invoice")} clients={data.clients} documents={data.docs} />
    </AppShell>
  );
}
