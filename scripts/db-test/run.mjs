// Applies every migration (in file order) to an in-memory Postgres that imitates
// Supabase (roles, auth.uid(), pgcrypto in the extensions schema) and runs an
// invoicing scenario as real authenticated users. Usage: npm install --no-package-lock && node run.mjs [--twice]
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("../..", import.meta.url));
const migrations = [
  ...readdirSync(`${repo}/drizzle/migrations`).filter((f) => f.endsWith(".sql")).sort().map((f) => `drizzle/migrations/${f}`),
  ...readdirSync(`${repo}/supabase/migrations`).filter((f) => f.endsWith(".sql")).sort().map((f) => `supabase/migrations/${f}`),
];
const twice = process.argv.includes("--twice"); // re-apply ours to prove idempotence

const db = new PGlite({ extensions: { pgcrypto } });
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth; create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create schema extensions; create extension pgcrypto schema extensions;
  grant usage on schema public, auth, extensions to anon, authenticated, service_role;
  grant execute on all functions in schema auth to anon, authenticated, service_role;
`);

let failures = 0;
const apply = async (file) => {
  try {
    await db.exec(`begin; ${readFileSync(`${repo}/${file}`, "utf8")}; commit;`);
    console.log(`MIGRATION OK   ${file}`);
  } catch (e) {
    failures++;
    await db.exec("rollback").catch(() => {});
    console.log(`MIGRATION FAIL ${file}\n  -> ${e.message}`);
  }
};
for (const f of migrations) await apply(f);
if (twice) for (const f of migrations.filter((f) => f.includes("20260930"))) await apply(f);

const U1 = "11111111-1111-4111-8111-111111111111"; // owner
const U2 = "22222222-2222-4222-8222-222222222222"; // plain member
await db.exec(`insert into auth.users values ('${U1}'), ('${U2}')`);

async function as(user, sql, params = []) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${user === "service" ? "" : user}', false);`);
  await db.exec(user === "service" ? "set role service_role" : "set role authenticated");
  try { return await db.query(sql, params); } finally { await db.exec("reset role"); }
}
const one = async (u, sql, p) => (await as(u, sql, p)).rows[0];
async function step(name, fn, expectError) {
  try {
    const out = await fn();
    if (expectError) { failures++; console.log(`FAIL  ${name}: expected ${expectError}, got success`); }
    else console.log(`ok    ${name}${out !== undefined ? ": " + JSON.stringify(out) : ""}`);
    return out;
  } catch (e) {
    if (expectError && e.message.includes(expectError)) console.log(`ok    ${name}: rejected with ${expectError}`);
    else { failures++; console.log(`FAIL  ${name}: ${e.message}`); }
  }
}

const biz = await step("create business", async () => (await one(U1, `select public.create_business('עסק בדיקה', '777777715', 'company') as id`)).id);
// A new business starts from zero: no documents, clients or numbering of its own.
const emptyBusiness = async (id) => {
  const r = await one("service", `select (select count(*) from public.documents where business_id = $1)::int as documents,
                                         (select count(*) from public.clients where business_id = $1)::int as clients,
                                         (select count(*) from public.document_sequences where business_id = $1)::int as sequences`, [id]);
  if (r.documents || r.clients || r.sequences) throw new Error(`NOT_EMPTY ${JSON.stringify(r)}`);
  return r;
};
await step("new business starts empty", () => emptyBusiness(biz));
await db.exec(`insert into public.business_members (business_id, user_id, role) values ('${biz}', '${U2}', 'user')`);
const client = await step("create client", async () => (await one(U1, `insert into public.clients (business_id, name, tax_id, is_vat_registered) values ($1, 'לקוח', '199999996', true) returning id`, [biz])).id);
const newDraft = async (type, extra = {}) => {
  const d = await one(U1, `insert into public.documents (business_id, client_id, type, issue_date, related_document_id, credit_reason)
                           values ($1, $2, $3, current_date, $4, $5) returning id, number`, [biz, client, type, extra.related ?? null, extra.reason ?? null]);
  await as(U1, `insert into public.document_items (document_id, description, quantity, unit_price, position, unit) values ($1, 'שירות', 2, 6000, 0, 'שעה')`, [d.id]);
  return d;
};
const issue = async (id) => (await one(U1, `select (public.issue_document($1)).number`, [id])).number;

// Numbering, issuance, immutability
const d1 = await step("draft invoice has no number", () => newDraft("invoice"));
await step("user cannot set a draft number", async () => { await as(U1, `update public.documents set number = 'X' where id = $1`, [d1.id]); return (await one(U1, `select number from public.documents where id = $1`, [d1.id])).number; });
await step("first invoice of a new business is number 1", async () => {
  const number = await issue(d1.id);
  if (!number.endsWith("-000001")) throw new Error(`UNEXPECTED_NUMBER ${number}`);
  return number;
});
await step("issued invoice cannot be edited", () => as(U1, `update public.documents set vat_rate = 0 where id = $1`, [d1.id]), "LOCKED");
await step("issued line unit cannot be edited", () => as(U1, `update public.document_items set unit = 'x' where document_id = $1`, [d1.id]), "LOCKED");
await step("user cannot issue by a direct update", async () => { const d = await newDraft("invoice"); return as(U1, `update public.documents set status = 'issued' where id = $1`, [d.id]); }, "INVALID_STATUS_TRANSITION");
await step("audit and snapshot recorded", async () => (await one(U1, `select count(*)::int as n from public.document_snapshots where business_id = $1`, [biz])).n);
await step("another new business also starts from zero", async () => {
  const other = (await one(U2, `select public.create_business('עסק חדש', '999999998', 'osek_murshe') as id`)).id;
  await emptyBusiness(other);
  const c = (await one(U2, `insert into public.clients (business_id, name, tax_id, is_vat_registered) values ($1, 'לקוח', '199999996', true) returning id`, [other])).id;
  const d = (await one(U2, `insert into public.documents (business_id, client_id, type, issue_date) values ($1, $2, 'invoice', current_date) returning id`, [other, c])).id;
  await as(U2, `insert into public.document_items (document_id, description, quantity, unit_price, position, unit) values ($1, 'שירות', 1, 100, 0, 'יחידה')`, [d]);
  const number = (await one(U2, `select (public.issue_document($1)).number`, [d])).number;
  if (!number.endsWith("-000001")) throw new Error(`UNEXPECTED_NUMBER ${number}`);
  return number;
});

// Appendix H: original / copy
await step("draft cannot be printed as a document", async () => one(U1, `select public.record_document_print($1) as l`, [(await newDraft("receipt")).id]), "DRAFT_IS_NOT_A_DOCUMENT");
await step("first print is מקור", async () => (await one(U1, `select public.record_document_print($1) as l`, [d1.id])).l);
await step("second print is העתק", async () => (await one(U2, `select public.record_document_print($1) as l`, [d1.id])).l);
await step("user cannot reset print tracking", async () => {
  await as(U1, `update public.documents set original_printed_at = null, print_count = 0 where id = $1`, [d1.id]);
  return one(U1, `select print_count, original_printed_at is not null as printed from public.documents where id = $1`, [d1.id]);
});
await step("print is in the audit trail", async () => (await one(U1, `select count(*)::int as n from public.audit_events where action = 'document.printed'`)).n);

// Credit note: reason required
const cn = await step("credit note draft without reason", () => newDraft("credit_note", { related: d1.id }));
await step("credit note without reason is blocked", () => issue(cn.id), "CREDIT_REASON_REQUIRED");
await step("credit note with reason is issued", async () => { await as(U1, `update public.documents set credit_reason = 'החזרת שירות' where id = $1`, [cn.id]); return issue(cn.id); });
await step("credit reason cannot change after issue", () => as(U1, `update public.documents set credit_reason = 'x' where id = $1`, [cn.id]), "ISSUED_DOCUMENT_IMMUTABLE");

// Receipts: cheque details, future dates
const ch = await newDraft("receipt");
await step("cheque receipt without details is blocked", async () => { await as(U1, `update public.documents set payment_method = 'המחאה' where id = $1`, [ch.id]); return issue(ch.id); }, "CHEQUE_DETAILS_REQUIRED");
await step("cheque receipt with details is issued", async () => { await as(U1, `update public.documents set cheque_bank='12', cheque_branch='345', cheque_account='123456', cheque_number='1001' where id = $1`, [ch.id]); return issue(ch.id); });
await step("future-dated document cannot be issued", async () => { const d = await newDraft("receipt"); await as(U1, `update public.documents set issue_date = current_date + 3 where id = $1`, [d.id]); return issue(d.id); }, "ISSUE_DATE_IN_FUTURE");

// Allocation: threshold, decisions
const held = async (decision) => {
  const d = await newDraft("invoice");
  await as(U1, `update public.documents set allocation_requested = true where id = $1`, [d.id]);
  await as(U1, `select public.reserve_document_number($1)`, [d.id]);
  await as(U1, `select public.begin_tax_authority_request($1, $2)`, [d.id, "allocation:" + d.id]);
  if (decision) await as("service", `update public.documents set allocation_decision = $2 where id = $1`, [d.id, decision]);
  return d;
};
await step("above threshold without allocation is blocked", async () => issue((await held(null)).id), "ALLOCATION_NUMBER_REQUIRED");
await step("decision 'continue' issues without allocation", async () => issue((await held("continue")).id));
await step("decision 'cancel' is recorded as cancelled", async () => { const d = await held("cancel"); await issue(d.id); return (await one(U1, `select status from public.documents where id = $1`, [d.id])).status; });
await step("reported draft cannot be deleted", async () => as(U1, `delete from public.documents where id = $1`, [(await held(null)).id]), "DRAFT_REPORTED_TO_TAX_AUTHORITY");

// Permissions
await step("plain member cannot cancel", () => as(U2, `select public.cancel_document($1, 'x')`, [d1.id]), "FORBIDDEN");
await step("owner cancels", async () => { await as(U1, `select public.cancel_document($1, 'טעות')`, [d1.id]); return (await one(U1, `select status from public.documents where id = $1`, [d1.id])).status; });
await step("service role stores an OAuth connection", () => as("service", `insert into public.tax_authority_connections (business_id, environment, access_token_ciphertext) values ($1, 'sandbox', 'x')`, [biz]));
await step("owner cannot read token ciphertext", () => as(U1, `select access_token_ciphertext from public.tax_authority_connections`), "permission denied");
await step("owner sees connection status", async () => (await one(U1, `select connected from public.get_tax_authority_connection_status($1, 'sandbox')`, [biz])).connected);
await step("user cannot burn sequence numbers", () => as(U1, `select public.next_document_number($1, 'invoice', 2026)`, [biz]), "permission denied");

console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
