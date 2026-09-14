import { statusLabel, type DocStatus } from "@/lib/store";

const styles: Record<DocStatus, string> = {
  draft: "bg-secondary text-muted-foreground",
  sent: "bg-accent text-accent-foreground",
  paid: "bg-primary/10 text-primary",
};

export function StatusBadge({ status }: { status: DocStatus }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${styles[status]}`}
    >
      {statusLabel[status]}
    </span>
  );
}
