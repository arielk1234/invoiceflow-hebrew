import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { actions, useData, type BusinessInfo, type BusinessType } from "@/lib/store";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "הגדרות עסק — חשבונית קלה" }, { name: "description", content: "פרטי העסק והגדרות מסמכים." }] }),
  component: SettingsPage,
});

const field = "w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30";
const labelCls = "mb-1.5 block text-xs font-semibold text-muted-foreground";

function SettingsPage() {
  const data = useData();
  const [form, setForm] = useState<BusinessInfo | null>(null);
  useEffect(() => { if (data && !form) setForm(data.business); }, [data, form]);
  if (!form) return <AppShell>טוען…</AppShell>;

  const set = <K extends keyof BusinessInfo>(key: K, value: BusinessInfo[K]) => setForm((f) => f ? { ...f, [key]: value } : f);
  const save = () => {
    if (!form.name.trim() || !form.taxId.trim()) return void toast.error("יש למלא שם עסק ומספר עוסק/חברה");
    actions.saveBusiness(form);
    toast.success("פרטי העסק נשמרו");
  };

  return <AppShell>
    <h1 className="text-2xl font-bold text-foreground">הגדרות עסק</h1>
    <p className="mt-1 text-sm text-muted-foreground">פרטי העסק וההגדרות שמשפיעות על סוגי המסמכים והמיסוי.</p>

    <section className="mt-6 max-w-3xl rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label className={labelCls}>שם העסק / הנישום</label><input className={field} value={form.name} onChange={(e) => set("name", e.target.value)} /></div>
        <div><label className={labelCls}>ע.מ / ח.פ</label><input className={field} inputMode="numeric" value={form.taxId} onChange={(e) => set("taxId", e.target.value.replace(/\D/g, ""))} /></div>
        <div><label className={labelCls}>סוג עוסק</label><select className={field} value={form.businessType} onChange={(e) => set("businessType", e.target.value as BusinessType)}><option value="exempt">עוסק פטור</option><option value="licensed">עוסק מורשה</option><option value="company">חברה בע״מ</option><option value="partnership">שותפות</option></select></div>
        <div><label className={labelCls}>שיעור מע״מ ברירת מחדל (%)</label><input className={field} type="number" min={0} max={100} step="0.01" value={form.vatRate} onChange={(e) => set("vatRate", Number(e.target.value))} /></div>
        <div><label className={labelCls}>תחילית סדרת מסמכים</label><input className={field} value={form.documentPrefix} onChange={(e) => set("documentPrefix", e.target.value.slice(0, 10))} /><p className="mt-1 text-xs text-muted-foreground">לא ניתן לשנות מספר של מסמך שכבר הופק.</p></div>
        <div className="sm:col-span-2"><label className={labelCls}>כתובת</label><input className={field} value={form.address} onChange={(e) => set("address", e.target.value)} /></div>
        <div><label className={labelCls}>טלפון</label><input className={field} value={form.phone} onChange={(e) => set("phone", e.target.value)} /></div>
        <div><label className={labelCls}>דוא״ל</label><input className={field} type="email" value={form.email} onChange={(e) => set("email", e.target.value)} /></div>
      </div>
      <div className="mt-6 rounded-xl border border-blue-300/40 bg-blue-50 p-4 text-sm text-blue-950"><p className="font-bold">מצב תאימות — 2026</p><ul className="mt-2 list-disc space-y-1 pr-5"><li>מסמכים שהופקו ננעלים ואינם ניתנים לעריכה או מחיקה.</li><li>ביטול מסמך מתועד עם סיבה במקום מחיקה.</li><li>חשבונית מס מעל 5,000 ₪ לפני מע״מ מסומנת ככזו הדורשת מספר הקצאה.</li><li>לפני הגשה לרשות המסים עדיין נדרש חיבור שרת מאובטח, מודול מבנה אחיד ובדיקת הקובץ בסימולטור הרשמי.</li></ul></div>
      <button onClick={save} className="mt-5 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90">שמירה</button>
    </section>
  </AppShell>;
}
