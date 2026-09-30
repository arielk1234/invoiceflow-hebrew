import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  authorizeUrl,
  createState,
  israelInvoiceEnvironment,
  israelInvoiceSetupStatus,
  type IsraelInvoiceSetupStatus,
} from "./israel-invoice-oauth";

/**
 * Server functions behind the "connect to the Tax Authority" settings card.
 * Safe to import from client code: the OAuth helpers are only used inside
 * handlers, so they stay on the server.
 */

const inputSchema = z.object({
  businessId: z.string().uuid(),
  accessToken: z.string().min(20),
});

export type IsraelInvoiceConnectionStatus = {
  environment: "sandbox" | "production";
  connected: boolean;
  connectedAt: string | null;
  setup: IsraelInvoiceSetupStatus;
  /** Set when the connection could not be read, e.g. before the migrations ran. */
  statusError: string | null;
};

function createServerSupabase(accessToken: string) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_SERVER_CONFIGURATION_MISSING");

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  });
}

/** Only a business owner or admin may see or change the Tax Authority connection. */
async function requireBusinessManager(
  supabase: ReturnType<typeof createServerSupabase>,
  businessId: string,
  accessToken: string,
) {
  const { data: userResult, error: userError } = await supabase.auth.getUser(accessToken);
  if (userError || !userResult.user) throw new Error("AUTH_REQUIRED");

  const { data: membership, error } = await supabase
    .from("business_members")
    .select("business_id, role")
    .eq("business_id", businessId)
    .eq("user_id", userResult.user.id)
    .single();

  if (error || !membership || !["owner", "admin"].includes(membership.role)) {
    throw new Error("FORBIDDEN");
  }
  return userResult.user;
}

export const getIsraelInvoiceConnectionStatus = createServerFn({ method: "POST" })
  .validator(inputSchema)
  .handler(async ({ data }): Promise<IsraelInvoiceConnectionStatus> => {
    const environment = israelInvoiceEnvironment();
    const supabase = createServerSupabase(data.accessToken);
    await requireBusinessManager(supabase, data.businessId, data.accessToken);
    const setup = israelInvoiceSetupStatus();

    // The RPC never returns token ciphertext.
    const { data: rows, error } = await supabase.rpc("get_tax_authority_connection_status", {
      _business_id: data.businessId,
      _environment: environment,
    });
    if (error) {
      return {
        environment,
        connected: false,
        connectedAt: null,
        setup,
        statusError: error.message,
      };
    }

    const row = (rows as Array<{ connected_at: string | null }> | null)?.[0];
    return {
      environment,
      connected: Boolean(row),
      connectedAt: row?.connected_at ?? null,
      setup,
      statusError: null,
    };
  });

export const startIsraelInvoiceOAuth = createServerFn({ method: "POST" })
  .validator(inputSchema)
  .handler(async ({ data }) => {
    const environment = israelInvoiceEnvironment();
    const supabase = createServerSupabase(data.accessToken);
    const user = await requireBusinessManager(supabase, data.businessId, data.accessToken);

    return {
      authorizationUrl: authorizeUrl(
        environment,
        createState(data.businessId, user.id, environment),
      ),
    };
  });

export type { IsraelInvoiceSetupStatus };
