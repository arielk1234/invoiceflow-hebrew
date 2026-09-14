import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { FileText, LayoutDashboard, Users, Settings, Plus } from "lucide-react";

const nav = [
  { to: "/", label: "לוח בקרה", icon: LayoutDashboard },
  { to: "/documents", label: "מסמכים", icon: FileText },
  { to: "/clients", label: "לקוחות", icon: Users },
  { to: "/settings", label: "הגדרות עסק", icon: Settings },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-card/85 backdrop-blur print:hidden">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4">
          <Link to="/" className="flex items-center gap-2">
            <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground">
              <FileText className="size-5" />
            </span>
            <span className="text-lg font-bold tracking-tight text-foreground">
              חשבונית קלה
            </span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {nav.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={{ exact: item.to === "/" }}
                activeProps={{ className: "bg-secondary text-foreground" }}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-foreground"
              >
                <item.icon className="size-4" />
                {item.label}
              </Link>
            ))}
          </nav>

          <Link
            to="/documents/new"
            className="mr-auto inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Plus className="size-4" />
            מסמך חדש
          </Link>
        </div>

        <nav className="flex items-center gap-1 overflow-x-auto border-t border-border/60 px-4 py-2 md:hidden">
          {nav.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={{ exact: item.to === "/" }}
              activeProps={{ className: "bg-secondary text-foreground" }}
              className="whitespace-nowrap rounded-lg px-3 py-1.5 text-sm text-muted-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 print:max-w-none print:p-0">
        {children}
      </main>
    </div>
  );
}
