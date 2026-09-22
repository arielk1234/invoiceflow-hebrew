import { createHmac, randomBytes, timingSafeEqual, createCipheriv, createDecipheriv } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const STATE_TTL_SECONDS = 10 * 60;

type OAuthTokenResponse = {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
};

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`MISSING_ENV_${name}`);
  return value;
}

function baseUrl(environment: "sandbox" | "production") {
  return environment === "production"
    ? "https://openapi.taxes.gov.il/shaam/production"
    : "https://openapi.taxes.gov.il/shaam/tsandbox";
}

function tokenUrl(environment: "sandbox" | "production") {
  return `${baseUrl(environment)}/longtimetoken/oauth2/token`;
}

function authorizeUrl(environment: "sandbox" | "production", state: string) {
  const url = new URL(`${baseUrl(environment)}/longtimetoken/oauth2/authorize`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", env("ISRAEL_INVOICE_CLIENT_ID"));
  url.searchParams.set("scope", env("ISRAEL_INVOICE_SCOPE"));
  url.searchParams.set("redirect_uri", env("ISRAEL_INVOICE_REDIRECT_URI"));
  url.searchParams.set("state", state);
  return url.toString();
}

function encryptionKey(): Buffer {
  const raw = Buffer.from(env("ISRAEL_INVOICE_TOKEN_ENCRYPTION_KEY"), "base64");
  if (raw.length !== 32) throw new Error("ISRAEL_INVOICE_TOKEN_ENCRYPTION_KEY_MUST_BE_32_BYTES_BASE64");
  return raw;
}

export function encryptSecret(value: string): string {
  const key = encryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ciphertext].map((v) => v.toString("base64url")).join(".");
}

export function decryptSecret(value: string): string {
  const [ivRaw, tagRaw, ciphertextRaw] = value.split(".");
  if (!ivRaw || !tagRaw || !ciphertextRaw) throw new Error("INVALID_ENCRYPTED_SECRET");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivRaw, "base64url"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextRaw, "base64url")), decipher.final()]).toString("utf8");
}

function signState(payload: string): string {
  return createHmac("sha256", env("ISRAEL_INVOICE_OAUTH_STATE_SECRET"))
    .update(payload)
    .digest("base64url");
}

function createState(businessId: string, userId: string, environment: "sandbox" | "production") {
  const payload = JSON.stringify({
    businessId,
    userId,
    environment,
    exp: Math.floor(Date.now() / 1000) + STATE_TTL_SECONDS,
    nonce: randomBytes(16).toString("base64url"),
  });
  return Buffer.from(payload).toString("base64url") + "." + signState(payload);
}

export function verifyState(state: string) {
  const [encoded, signature] = state.split(".");
  if (!encoded || !signature) throw new Error("INVALID_OAUTH_STATE");
  const payload = Buffer.from(encoded, "base64url").toString("utf8");
  const expected = signState(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("INVALID_OAUTH_STATE");
  const parsed = JSON.parse(payload) as { businessId: string; userId: string; environment: "sandbox" | "production"; exp: number };
  if (parsed.exp < Math.floor(Date.now() / 1000)) throw new Error("OAUTH_STATE_EXPIRED");
  return parsed;
}

export async function exchangeAuthorizationCode(environment: "sandbox" | "production", code: string) {
  const credentials = Buffer.from(
    `${env("ISRAEL_INVOICE_CLIENT_ID")}:${env("ISRAEL_INVOICE_CLIENT_SECRET")}`,
  ).toString("base64");

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: env("ISRAEL_INVOICE_REDIRECT_URI"),
    scope: env("ISRAEL_INVOICE_SCOPE"),
  });

  const response = await fetch(tokenUrl(environment), {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });

  const payload = (await response.json().catch(() => null)) as OAuthTokenResponse | { error?: string } | null;
  if (!response.ok || !payload || !("access_token" in payload) || !payload.access_token) {
    throw new Error(`ISRAEL_INVOICE_OAUTH_TOKEN_ERROR_${response.status}`);
  }
  return payload;
}

export async function refreshAccessToken(environment: "sandbox" | "production", refreshToken: string) {
  const body = new URLSearchParams({
    client_id: env("ISRAEL_INVOICE_CLIENT_ID"),
    client_secret: env("ISRAEL_INVOICE_CLIENT_SECRET"),
    scope: env("ISRAEL_INVOICE_SCOPE"),
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  const response = await fetch(tokenUrl(environment), {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });

  const payload = (await response.json().catch(() => null)) as OAuthTokenResponse | null;
  if (!response.ok || !payload?.access_token) {
    throw new Error(`ISRAEL_INVOICE_OAUTH_REFRESH_ERROR_${response.status}`);
  }
  return payload;
}

const startSchema = z.object({
  businessId: z.string().uuid(),
  environment: z.enum(["sandbox", "production"]),
  accessToken: z.string().min(20),
});

export const startIsraelInvoiceOAuth = createServerFn({ method: "POST" })
  .validator(startSchema)
  .handler(async ({ data }) => {
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(
      env("SUPABASE_URL"),
      env("SUPABASE_PUBLISHABLE_KEY"),
      { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${data.accessToken}` } } },
    );

    const { data: userResult, error: userError } = await supabase.auth.getUser(data.accessToken);
    if (userError || !userResult.user) throw new Error("AUTH_REQUIRED");

    const { data: membership, error } = await supabase
      .from("business_members")
      .select("business_id, role")
      .eq("business_id", data.businessId)
      .eq("user_id", userResult.user.id)
      .single();

    if (error || !membership || !["owner", "admin"].includes(membership.role)) {
      throw new Error("FORBIDDEN");
    }

    return { authorizationUrl: authorizeUrl(data.environment, createState(data.businessId, userResult.user.id, data.environment)) };
  });
