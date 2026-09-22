import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { exchangeAuthorizationCode, encryptSecret, verifyState } from "@/lib/israel-invoice-oauth";

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`MISSING_ENV_${name}`);
  return value;
}

export const Route = createFileRoute("/api/israel-invoice/oauth/callback" as any)({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const error = url.searchParams.get("error");

        if (error) return new Response(`Tax Authority authorization failed: ${error}`, { status: 400 });
        if (!code || !state) return new Response("Missing OAuth code/state", { status: 400 });

        const stateData = verifyState(state);
        const token = await exchangeAuthorizationCode(stateData.environment, code);

        const admin = createClient(
          required("SUPABASE_URL"),
          required("SUPABASE_SERVICE_ROLE_KEY"),
          { auth: { persistSession: false, autoRefreshToken: false } },
        );

        const { error: dbError } = await admin
          .from("tax_authority_connections")
          .upsert({
            business_id: stateData.businessId,
            environment: stateData.environment,
            access_token_ciphertext: encryptSecret(token.access_token),
            refresh_token_ciphertext: token.refresh_token ? encryptSecret(token.refresh_token) : null,
            access_token_expires_at: new Date(Date.now() + Number(token.expires_in ?? 1800) * 1000).toISOString(),
            scope: token.scope ?? null,
            connected_by: stateData.userId,
          }, { onConflict: "business_id,provider,environment" });

        if (dbError) return new Response("Failed to save Tax Authority connection", { status: 500 });

        return new Response(
          "<html><body dir='rtl'><h2>החיבור לרשות המסים הושלם בהצלחה</h2><p>ניתן לסגור את החלון ולחזור ל-InvoiceFlow.</p></body></html>",
          { headers: { "Content-Type": "text/html; charset=utf-8" } },
        );
      },
    },
  },
});
