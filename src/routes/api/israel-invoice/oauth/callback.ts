import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { exchangeAuthorizationCode, encryptSecret, verifyState } from "@/lib/israel-invoice-oauth";

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`MISSING_ENV_${name}`);
  return value;
}

export const Route = createFileRoute("/api/israel-invoice/oauth/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        // Send the user back to the settings page, which shows the result. The
        // registered redirect URI is the app's public address, even behind a proxy.
        const publicOrigin = new URL(process.env.ISRAEL_INVOICE_REDIRECT_URI || request.url).origin;
        const backToSettings = (result: "connected" | "denied" | "error") =>
          new Response(null, {
            status: 302,
            headers: { Location: `${publicOrigin}/settings?tax_authority=${result}` },
          });

        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");

        if (url.searchParams.get("error")) return backToSettings("denied");
        if (!code || !state) return backToSettings("error");

        try {
          const stateData = verifyState(state);
          const token = await exchangeAuthorizationCode(stateData.environment, code);

          const admin = createClient(
            required("SUPABASE_URL"),
            required("SUPABASE_SERVICE_ROLE_KEY"),
            { auth: { persistSession: false, autoRefreshToken: false } },
          );

          const { error: dbError } = await admin.from("tax_authority_connections").upsert(
            {
              business_id: stateData.businessId,
              environment: stateData.environment,
              access_token_ciphertext: encryptSecret(token.access_token),
              refresh_token_ciphertext: token.refresh_token
                ? encryptSecret(token.refresh_token)
                : null,
              access_token_expires_at: new Date(
                Date.now() + Number(token.expires_in ?? 1800) * 1000,
              ).toISOString(),
              scope: token.scope ?? null,
              connected_by: stateData.userId,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "business_id,provider,environment" },
          );

          if (dbError) throw dbError;
        } catch (err) {
          console.error(
            "Israel Invoice OAuth callback failed",
            err instanceof Error ? err.message : err,
          );
          return backToSettings("error");
        }

        return backToSettings("connected");
      },
    },
  },
});
