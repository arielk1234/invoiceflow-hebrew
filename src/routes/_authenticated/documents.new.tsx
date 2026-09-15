import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { DocEditor } from "@/components/DocEditor";
import { emptyDoc, useData } from "@/lib/store";

export const Route = createFileRoute("/_authenticated/documents/new")({
  head: () => ({
    meta: [
      { title: "מסמך חדש — חשבונית קלה" },
      {
        name: "description",
        content: "יצירת חשבונית מס או קבלה חדשה עם שורות חיוב וחישוב מע״מ אוטומטי.",
      },
      { property: "og:title", content: "מסמך חדש — חשבונית קלה" },
      { property: "og:description", content: "הפקת חשבונית או קבלה בכמה קליקים." },
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
        מלא את הפרטים — החישוב והמע״מ מתעדכנים אוטומטית.
      </p>
      <DocEditor
        key={data.docs.length}
        initial={emptyDoc("invoice", data.docs)}
        clients={data.clients}
        allDocs={data.docs}
      />
    </AppShell>
  );
}
