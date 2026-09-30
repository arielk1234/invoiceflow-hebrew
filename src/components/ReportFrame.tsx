import type { ReactNode } from "react";

/**
 * A visual and printed output as appendix H (a)(2) of the Income Tax bookkeeping
 * instructions requires: the taxpayer's name, the period, what the output is, when
 * it was produced and an end-of-output mark (pages are numbered by the print CSS).
 */
export function ReportFrame({
  title,
  businessName,
  taxId,
  period,
  producedAt = new Date(),
  children,
}: {
  title: string;
  businessName: string;
  taxId: string;
  period: string;
  producedAt?: Date;
  children: ReactNode;
}) {
  const produced = new Intl.DateTimeFormat("he-IL", {
    timeZone: "Asia/Jerusalem",
    dateStyle: "short",
    timeStyle: "short",
  }).format(producedAt);

  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-sm print:rounded-none print:border-0 print:p-0 print:shadow-none">
      <header className="border-b border-border pb-3">
        <h2 className="text-xl font-bold text-foreground">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {businessName} · ע.מ / ח.פ {taxId}
        </p>
        <p className="text-sm text-muted-foreground">
          תקופה: {period} · הופק: {produced}
        </p>
      </header>
      <div className="mt-4">{children}</div>
      <p className="mt-6 text-center text-sm font-semibold text-foreground">*** סוף הפלט ***</p>
    </section>
  );
}
