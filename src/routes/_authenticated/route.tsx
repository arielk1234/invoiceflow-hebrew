import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });

    const user = data.user;
    const meta = (user.user_metadata ?? {}) as Record<string, string>;
    const { data: existing } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();

    if (!existing) {
      await supabase.from("profiles").insert({
        id: user.id,
        email: user.email ?? "",
        full_name: meta['full_name'] ?? "",
        business_name: meta['business_name'] ?? "",
        business_type:
          (meta['business_type'] as "osek_patur" | "osek_murshe" | "company") ??
          "osek_patur",
        tax_id: meta['tax_id'] ?? "",
      });
    }

    return { user };
  },
  component: () => <Outlet />,
});
