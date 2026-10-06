import assert from "node:assert/strict";
import {
  buildApprovalRequest,
  buildDecisionRequest,
  invoiceDecisionUrl,
  parseApprovalResponse,
  parseDecisionResponse,
} from "../src/lib/israel-invoice-api";
import { isValidIsraeliTaxId, shortAllocationNumber } from "../src/lib/israel-compliance";
import { errorMessage, isHeldInvoiceError } from "../src/lib/error-messages";
import * as uf from "../src/lib/uniform-format";
import type { BusinessInfo } from "../src/lib/store";
import * as ut from "../src/lib/uniform-transmission";

// --- Approval V2 (official examples, section 2.3)
assert.deepEqual(
  parseApprovalResponse({
    status: 200,
    message: "Invoice approved",
    confirmation_number: "20240627231846297178091822",
    approved: true,
  }),
  { kind: "approved", confirmationNumber: "20240627231846297178091822" },
);
assert.equal(shortAllocationNumber("20240627231846297178091822"), "178091822");
assert.deepEqual(
  parseApprovalResponse({
    status: 200,
    message: { errors: [{ code: 461 }] },
    confirmation_number: "0",
    approved: false,
  }),
  { kind: "not_approved", code: 461 },
);
assert.deepEqual(
  parseApprovalResponse({
    status: 400,
    message: { errors: [{ code: 434 }] },
    confirmation_number: "0",
    approved: false,
  }),
  { kind: "invalid", code: 434 },
);
const approval = (softwareRegistrationNumber: string) =>
  buildApprovalRequest({
    invoiceId: "d",
    invoiceType: 305,
    issuerVatNumber: "777777715",
    customerVatNumber: "199999996",
    customerName: "לקוח",
    invoiceReferenceNumber: "INV-2026-000001",
    invoiceDate: "2026-09-30",
    issuanceDate: "2026-09-30",
    userName: "u",
    softwareRegistrationNumber,
    clientSoftwareKey: "b",
    subtotalBeforeVat: 12000,
    vatAmount: 2160,
  });
assert.equal(approval("12345678").accounting_software_number, 12345678); // 8-digit certificate number
assert.equal(approval("777777715").accounting_software_number, 777777715); // VAT number before registration
assert.throws(() => approval("1234567"), /INVALID_SOFTWARE_REGISTRATION_NUMBER/);
assert.equal(approval("12345678").payment_amount_including_vat, 14160);

// --- Invoice-decision V1 (section 4.2)
assert.equal(
  invoiceDecisionUrl("sandbox", "continue"),
  "https://ita-api.taxes.gov.il/shaam/tsandbox/Invoice-decision/v1/Continue",
);
assert.equal(
  buildDecisionRequest({
    invoiceId: "d",
    issuerVatNumber: "777777715",
    userName: "u",
    softwareRegistrationNumber: "12345678",
  }).accounting_software_number,
  12345678,
);
assert.deepEqual(parseDecisionResponse(200, { status: 200, message: "Decision accepted" }), {
  accepted: true,
});
assert.deepEqual(
  parseDecisionResponse(400, { status: 400, message: { errors: [{ code: 463 }] } }),
  { accepted: false, code: 463 },
);
assert.ok(
  isHeldInvoiceError(new Error("ALLOCATION_NOT_APPROVED_460")) &&
    !isHeldInvoiceError(new Error("ALLOCATION_NOT_APPROVED_462")),
);

// --- VAT numbers and messages
for (const ok of ["777777715", "199999996", "199999988"]) assert.ok(isValidIsraeliTaxId(ok), ok);
for (const bad of ["777777716", "12345678", ""]) assert.ok(!isValidIsraeliTaxId(bad), bad);
assert.match(errorMessage(new Error("CHEQUE_DETAILS_REQUIRED"), "x"), /המחאה/);
assert.match(errorMessage({ message: "ISSUE_DATE_IN_FUTURE" }, "x"), /עתידי/);
assert.match(
  errorMessage({ message: "Could not find the function public.x in the schema cache" }, "x"),
  /המיגרציות/,
);
assert.match(errorMessage(new Error("INVALID_SOFTWARE_REGISTRATION_NUMBER"), "x"), /8 או 9/);

// --- Uniform Format: the simulator file (same exporter as real exports)
const business: BusinessInfo = {
  id: "b",
  name: "עסק בדיקה",
  taxId: "777777715",
  address: "הרצל 10",
  phone: "",
  email: "",
  documentPrefix: "",
  businessType: "company",
  vatRate: 18,
};
const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
const fixture = uf.buildSimulatorFixture({
  business,
  clients: [],
  docs: [],
  fromDate: `${today.slice(0, 4)}-01-01`,
  toDate: today,
  config: {
    registrationNumber: "",
    softwareName: "InvoiceFlow",
    softwareVersion: "1.0",
    manufacturerTaxId: "199999996",
    manufacturerName: "InvoiceFlow",
    softwareType: 2,
    accountingType: 0,
  },
});
assert.deepEqual(uf.validateUniformExportText(fixture), []);
assert.ok(fixture.simulatorRecords >= 2000 && fixture.simulatorBytes <= 4 * 1024 * 1024);
const lines = fixture.bkmvdataText.split("\r\n").filter(Boolean);
const codes = new Set(lines.map((l) => l.slice(0, 4)));
for (const c of ["A100", "B110", "C100", "D110", "D120", "Z900"])
  assert.ok(codes.has(c), `missing ${c}`);
assert.ok(!codes.has("100C") && !codes.has("110D"), "reversed record codes");
// Every cheque payment carries bank/branch/account/cheque number (1307-1310).
for (const l of lines.filter((x) => x.startsWith("D120") && x[49] === "2"))
  assert.ok(!/^0+$/.test(l.slice(50, 60)) && !/^0+$/.test(l.slice(85, 95)), "cheque details");
// No date after today (fields 1205, 1230, 1272, 1322).
const t8 = today.replace(/-/g, "");
for (const l of lines) {
  const dates = l.startsWith("C100")
    ? [l.slice(45, 53), l.slice(400, 408)]
    : l.startsWith("D110")
      ? [l.slice(296, 304)]
      : l.startsWith("D120")
        ? [l.slice(147, 155)]
        : [];
  for (const d of dates) assert.ok(d <= t8, `future date ${d}`);
}
// INI summaries only for present types, matching counts.
const ini = fixture.iniText.split("\r\n").filter(Boolean);
assert.equal(ini[0]!.length, 466);
for (const s of ini.slice(1))
  assert.equal(Number(s.slice(4)), lines.filter((l) => l.startsWith(s.slice(0, 4))).length);
assert.throws(
  () =>
    uf.exportUniformFormat({
      business,
      clients: [],
      docs: [],
      fromDate: "2026-01-01",
      toDate: "2999-01-01",
      config: {
        registrationNumber: "",
        softwareName: "a",
        softwareVersion: "1",
        manufacturerTaxId: "199999996",
        manufacturerName: "a",
      },
    }),
  /DATE_RANGE_IN_FUTURE/,
);

console.log(
  `all checks passed (simulator file: ${fixture.simulatorRecords} records, ${fixture.recordCounts.B110} accounts)`,
);
// Units of measure reach field 1263 (D110).
const units = new Set(
  lines.filter((l) => l.startsWith("D110")).map((l) => l.slice(203, 223).trim()),
);
assert.ok(units.has("שעה") && units.has("יחידה"), `units: ${[...units].join(",")}`);
console.log("units in D110:", [...units].join(", "));

// --- Transmitting the Uniform Format files (Supplement 1, 3.2026), official examples
assert.deepEqual(ut.buildUploadLinksRequest("777777715", "2026-01-01", "2026-10-06"), {
  caseNumber: 777777715,
  startPeriod: "2026-01-01",
  endPeriod: "2026-10-06",
});
assert.throws(
  () => ut.buildUploadLinksRequest("12345", "2026-01-01", "2026-10-06"),
  /INVALID_ISSUER_VAT_NUMBER/,
);
const links = ut.parseUploadLinksResponse(200, {
  success: true,
  data: {
    uniqueId: "145126010511012313082",
    files: [
      {
        fileName: "INI_N20260105_110735_Z9999999_F777777745.pdf",
        signUrl: "https://storage.googleapis.com/a",
        fileUniqueId: "1451495302db-c50f-4a28-9ed5-87fd7cf04053.txt ",
        headers: { "x-goog-content-length-range": "0,1048576", "x-goog-resumable": "start" },
      },
      {
        fileName: "FROMBKM_W20260105_110735_777777745_BKMVDATA.pdf",
        signUrl: "https://storage.googleapis.com/b",
        fileUniqueId: "1451495302db-c50f-4a28-9ed5-87fd7cf04054.txt",
        headers: { "x-goog-content-length-range": "0,53687091200", "x-goog-resumable": "start" },
      },
    ],
  },
  error: null,
});
assert.equal(links.kind, "ok");
if (links.kind === "ok") {
  assert.equal(links.ini.fileUniqueId, "1451495302db-c50f-4a28-9ed5-87fd7cf04053.txt");
  assert.equal(links.ini.maxBytes, 1048576);
  assert.equal(links.bkmvdata.maxBytes, 53687091200);
  assert.equal(links.ini.headers["x-goog-resumable"], "start");
}
assert.equal(
  ut.parseUploadLinksResponse(400, {
    success: false,
    data: null,
    error: {
      errorCode: 400,
      message: "There is no requirement for a uniform structure file for this case number",
    },
  }).kind,
  "not_required",
);
assert.deepEqual(
  ut.parseUploadLinksResponse(400, {
    success: false,
    data: null,
    error: { errorCode: 502, message: "upstream" },
  }),
  { kind: "error", code: 502, message: "upstream" },
);
assert.deepEqual(ut.parseUploadLinksResponse(401, null), {
  kind: "error",
  code: 401,
  message: "HTTP 401",
});
const MB = 1024 * 1024;
assert.deepEqual([10 * MB, 100 * MB, 500 * MB, 2048 * MB].map(ut.uploadChunkSize), [
  10 * MB,
  32 * MB,
  64 * MB,
  128 * MB,
]);
assert.deepEqual(
  ut.parseFileStatusResponse([
    {
      fileName: "a.txt",
      status: "Approved",
      description: "",
      isFound: true,
      errorCode: null,
      errorMessage: null,
    },
    {
      fileName: "b.pdf",
      status: "",
      description: "",
      isFound: false,
      errorCode: 400,
      errorMessage: "File not found.",
    },
  ]),
  [
    {
      fileUniqueId: "a.txt",
      status: "Approved",
      description: "",
      isFound: true,
      errorMessage: null,
    },
    {
      fileUniqueId: "b.pdf",
      status: "",
      description: "",
      isFound: false,
      errorMessage: "File not found.",
    },
  ],
);
console.log("uniform transmission checks passed");
