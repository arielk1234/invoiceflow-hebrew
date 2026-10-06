/**
 * Transmitting the Uniform Format files to the Tax Authority, per "Supplement 1
 * to the Uniform Format instructions" (תוספת מס' 1, 3.2026): every registered
 * software transmits INI and BKMVDATA through the API as soon as they are
 * produced, and doing so is a condition of registration.
 *
 * Flow: (1) ask for upload links (GetUrlsForUploadingFiles); (2) for each file,
 * open a resumable upload on its signed URL (POST, 201 + Location); (3) PUT the
 * file there; then (4) poll Get-File-Status with each fileUniqueId.
 * Authorization is OAuth2 User Restricted, the same connection as Israel Invoice.
 */

export type TaxAuthorityEnvironment = "sandbox" | "production";

export const UNIFORM_UPLOAD_LINKS_URL: Record<TaxAuthorityEnvironment, string> = {
  sandbox:
    "https://ita-api.taxes.gov.il/shaam/tsandbox/UniStructFileUploadLinksApi/v1/UploadingFile/GetUrlsForUploadingFiles",
  production:
    "https://openapi.taxes.gov.il/shaam/production/UniStructFileUploadLinksApi/v1/UploadingFile/GetUrlsForUploadingFiles",
};

export const UNIFORM_FILE_STATUS_URL: Record<TaxAuthorityEnvironment, string> = {
  sandbox: "https://ita-api.taxes.gov.il/shaam/tsandbox/FilesStatusApi/v1/Files/get-file-status",
  production:
    "https://ita-api.taxes.gov.il/shaam/production/FilesStatusApi/v1/Files/get-file-status",
};

/** Request body, table 2.1 (dates as in the official examples, YYYY-MM-DD). */
export function buildUploadLinksRequest(caseNumber: string, fromDate: string, toDate: string) {
  if (!/^\d{9}$/.test(caseNumber)) throw new Error("INVALID_ISSUER_VAT_NUMBER");
  return { caseNumber: Number(caseNumber), startPeriod: fromDate, endPeriod: toDate };
}

export type UploadTarget = {
  fileName: string;
  fileUniqueId: string;
  signUrl: string;
  headers: Record<string, string>;
  /** Upper bound of x-goog-content-length-range, set by the Tax Authority per business. */
  maxBytes: number;
};

export type UploadLinksResult =
  | { kind: "ok"; uniqueId: string; ini: UploadTarget; bkmvdata: UploadTarget }
  /** The Tax Authority has not asked this business for a Uniform Format file. */
  | { kind: "not_required"; message: string }
  | { kind: "error"; code: number; message: string };

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => typeof value === "object" && value !== null;

function uploadTarget(file: unknown): UploadTarget | null {
  if (
    !isObject(file) ||
    typeof file.signUrl !== "string" ||
    typeof file.fileUniqueId !== "string"
  ) {
    return null;
  }
  const headers: Record<string, string> = {};
  if (isObject(file.headers)) {
    for (const [name, value] of Object.entries(file.headers)) {
      if (typeof value === "string") headers[name] = value;
    }
  }
  const range = headers["x-goog-content-length-range"]?.split(",")[1];
  return {
    fileName: typeof file.fileName === "string" ? file.fileName : "",
    fileUniqueId: file.fileUniqueId.trim(),
    signUrl: file.signUrl,
    headers,
    maxBytes: range ? Number(range) : Number.POSITIVE_INFINITY,
  };
}

/** Response of GetUrlsForUploadingFiles, tables 2.2-2.4: files[0] is INI, files[1] BKMVDATA. */
export function parseUploadLinksResponse(httpStatus: number, body: unknown): UploadLinksResult {
  const error = isObject(body) && isObject(body.error) ? body.error : null;
  const message = typeof error?.message === "string" ? error.message : "";
  if (/no requirement for a uniform structure file/i.test(message)) {
    return { kind: "not_required", message };
  }
  if (httpStatus === 200 && isObject(body) && body.success === true && isObject(body.data)) {
    const files = Array.isArray(body.data.files) ? body.data.files : [];
    const ini = uploadTarget(files[0]);
    const bkmvdata = uploadTarget(files[1]);
    if (ini && bkmvdata) {
      return { kind: "ok", uniqueId: String(body.data.uniqueId ?? ""), ini, bkmvdata };
    }
  }
  const code = typeof error?.errorCode === "number" ? error.errorCode : httpStatus;
  return { kind: "error", code, message: message || `HTTP ${httpStatus}` };
}

/**
 * Chunk size for the upload (section 3.2): up to 32 MB in one request, then
 * 32 MB chunks up to 250 MB, 64 MB up to 1 GB and 128 MB above.
 */
export function uploadChunkSize(totalBytes: number): number {
  const MB = 1024 * 1024;
  if (totalBytes <= 32 * MB) return totalBytes;
  if (totalBytes <= 250 * MB) return 32 * MB;
  if (totalBytes <= 1024 * MB) return 64 * MB;
  return 128 * MB;
}

export type FileStatus = {
  fileUniqueId: string;
  /** Uploaded (waiting), Approved or Rejected; empty when the file was not found. */
  status: "Uploaded" | "Approved" | "Rejected" | "";
  description: string;
  isFound: boolean;
  errorMessage: string | null;
};

/** Response of Get-File-Status, section 4.4: one item per requested file. */
export function parseFileStatusResponse(body: unknown): FileStatus[] {
  if (!Array.isArray(body)) return [];
  return body.filter(isObject).map((item) => ({
    fileUniqueId: typeof item.fileName === "string" ? item.fileName : "",
    status: (["Uploaded", "Approved", "Rejected"] as const).find((s) => s === item.status) ?? "",
    description: typeof item.description === "string" ? item.description : "",
    isFound: item.isFound === true,
    errorMessage: typeof item.errorMessage === "string" ? item.errorMessage : null,
  }));
}
