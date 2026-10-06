import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  createAdminSupabase,
  createServerSupabase,
  taxAuthorityAccessToken,
} from "./israel-invoice-functions";
import { israelInvoiceEnvironment } from "./israel-invoice-oauth";
import { toUniformDownloadBytes } from "./uniform-format";
import {
  buildUploadLinksRequest,
  parseFileStatusResponse,
  parseUploadLinksResponse,
  uploadChunkSize,
  UNIFORM_FILE_STATUS_URL,
  UNIFORM_UPLOAD_LINKS_URL,
  type FileStatus,
  type UploadTarget,
} from "./uniform-transmission";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Any member of the business may produce, and so transmit, the Uniform Format files. */
async function requireMember(accessToken: string, businessId: string) {
  const supabase = createServerSupabase(accessToken);
  const { data: userResult, error: userError } = await supabase.auth.getUser(accessToken);
  if (userError || !userResult.user) throw new Error("AUTH_REQUIRED");
  const { data: business, error } = await supabase
    .from("businesses")
    .select("id, tax_id")
    .eq("id", businessId)
    .single();
  if (error || !business) throw new Error("FORBIDDEN");
  return { user: userResult.user, business };
}

/** An error code that tells the user what to do, as for allocation requests. */
function taxAuthorityError(prefix: string, status: number): Error {
  if (status === 401) return new Error("ISRAEL_INVOICE_OAUTH_UNAUTHORIZED");
  if (status === 403 || status === 406) return new Error("UNIFORM_TRANSMISSION_FORBIDDEN");
  return new Error(`${prefix}_${status}`);
}

/** Opens a resumable upload on the signed URL and sends the file (section 3). */
async function uploadFile(target: UploadTarget, bytes: Uint8Array) {
  const start = await fetch(target.signUrl, { method: "POST", headers: target.headers });
  const location = start.headers.get("location");
  if (start.status !== 201 || !location) {
    throw new Error(`UNIFORM_UPLOAD_FAILED_${start.status}`);
  }

  const chunk = uploadChunkSize(bytes.length);
  for (let offset = 0; offset < bytes.length || offset === 0; offset += chunk) {
    const end = Math.min(offset + chunk, bytes.length);
    const last = end === bytes.length;
    const response = await fetch(location, {
      method: "PUT",
      headers:
        chunk === bytes.length
          ? {}
          : { "Content-Range": `bytes ${offset}-${end - 1}/${bytes.length}` },
      body: bytes.slice(offset, end),
    });
    // 308 acknowledges a chunk; the last one completes with 200 or 201.
    if (last ? !response.ok : response.status !== 308) {
      throw new Error(`UNIFORM_UPLOAD_FAILED_${response.status}`);
    }
    if (last) break;
  }
}

export type TransmissionResult =
  | {
      status: "transmitted";
      uniqueId: string;
      files: Array<{ kind: "INI" | "BKMVDATA"; fileUniqueId: string }>;
    }
  | { status: "not_required" };

/**
 * Transmits INI and BKMVDATA to the Tax Authority right after they are produced
 * (Supplement 1 to the Uniform Format instructions, 3.2026).
 */
export const transmitUniformFile = createServerFn({ method: "POST" })
  .validator(
    z.object({
      businessId: z.string().uuid(),
      accessToken: z.string().min(20),
      fromDate: isoDate,
      toDate: isoDate,
      iniText: z.string().min(1),
      bkmvdataText: z.string().min(1),
    }),
  )
  .handler(async ({ data }): Promise<TransmissionResult> => {
    const { user, business } = await requireMember(data.accessToken, data.businessId);
    const environment = israelInvoiceEnvironment();
    const admin = createAdminSupabase();
    const token = await taxAuthorityAccessToken(admin, data.businessId, environment);

    const linksResponse = await fetch(UNIFORM_UPLOAD_LINKS_URL[environment], {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(buildUploadLinksRequest(business.tax_id, data.fromDate, data.toDate)),
    });
    const links = parseUploadLinksResponse(
      linksResponse.status,
      await linksResponse.json().catch(() => null),
    );
    if (links.kind === "not_required") return { status: "not_required" };
    if (links.kind === "error") throw taxAuthorityError("UNIFORM_TRANSMISSION_FAILED", links.code);

    const ini = toUniformDownloadBytes(data.iniText);
    const bkmvdata = toUniformDownloadBytes(data.bkmvdataText);
    // Check both sizes first, so a file that is too large never leaves half a set behind.
    if (ini.length > links.ini.maxBytes || bkmvdata.length > links.bkmvdata.maxBytes) {
      throw new Error("UNIFORM_FILE_TOO_LARGE");
    }

    const files = [
      { kind: "INI" as const, fileUniqueId: links.ini.fileUniqueId },
      { kind: "BKMVDATA" as const, fileUniqueId: links.bkmvdata.fileUniqueId },
    ];
    // Every attempt is recorded, including one that failed after a file was sent.
    const record = async (action: string, extra: Record<string, unknown> = {}) => {
      const { error } = await admin.from("audit_events").insert({
        business_id: data.businessId,
        actor_user_id: user.id,
        action,
        entity: "uniform_file",
        payload: {
          environment,
          from: data.fromDate,
          to: data.toDate,
          unique_id: links.uniqueId,
          files,
          ...extra,
        },
      });
      if (error) console.error("Uniform Format transmission audit failed", error.message);
    };
    try {
      await uploadFile(links.ini, ini);
      await uploadFile(links.bkmvdata, bkmvdata);
    } catch (error) {
      await record("uniform_file.transmission_failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
    await record("uniform_file.transmitted");
    return { status: "transmitted", uniqueId: links.uniqueId, files };
  });

/** Status of transmitted files at the Tax Authority (Get-File-Status, section 4). */
export const uniformFileStatus = createServerFn({ method: "POST" })
  .validator(
    z.object({
      businessId: z.string().uuid(),
      accessToken: z.string().min(20),
      fileUniqueIds: z.array(z.string().min(1).max(100)).min(1).max(10),
    }),
  )
  .handler(async ({ data }): Promise<FileStatus[]> => {
    await requireMember(data.accessToken, data.businessId);
    const environment = israelInvoiceEnvironment();
    const token = await taxAuthorityAccessToken(
      createAdminSupabase(),
      data.businessId,
      environment,
    );
    const response = await fetch(UNIFORM_FILE_STATUS_URL[environment], {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(data.fileUniqueIds.map((fileName) => ({ fileName }))),
    });
    if (!response.ok) throw taxAuthorityError("UNIFORM_STATUS_FAILED", response.status);
    return parseFileStatusResponse(await response.json().catch(() => null));
  });
