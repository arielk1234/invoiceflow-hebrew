// Builds INI.TXT + BKMVDATA.TXT for the Tax Authority's Uniform Format simulator
// (≥2000 records, every document type the software issues).
// Business AND manufacturer details are fictitious on purpose: the owner's real
// details are sent to the simulator only by the owner, never by a script.
// Usage: npx tsx scripts/simulator/gen-fixture.ts <output dir>
import { mkdirSync, writeFileSync } from "node:fs";
import * as uf from "../../src/lib/uniform-format";
import type { BusinessInfo } from "../../src/lib/store";

const out = process.argv[2];
if (!out) throw new Error("usage: gen-fixture.ts <output dir>");

const business: BusinessInfo = {
  id: "b",
  name: "עסק בדיקה בע״מ",
  taxId: "777777715",
  address: "הרצל 10, תל אביב",
  phone: "",
  email: "",
  documentPrefix: "",
  businessType: "company",
  vatRate: 18,
};
const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
const result = uf.buildSimulatorFixture({
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

const errors = uf.validateUniformExportText(result);
if (errors.length) {
  console.error(errors);
  process.exit(1);
}
mkdirSync(out, { recursive: true });
writeFileSync(`${out}/INI.TXT`, uf.toUniformDownloadBytes(result.iniText));
writeFileSync(`${out}/BKMVDATA.TXT`, uf.toUniformDownloadBytes(result.bkmvdataText));
console.log(result.recordCounts);
