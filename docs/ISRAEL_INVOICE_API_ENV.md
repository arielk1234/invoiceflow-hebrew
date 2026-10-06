# Israel Tax Authority API environment

These values are server-side secrets/configuration. Never expose them through Vite/React variables and never commit real values.

Step-by-step setup (developer portal, secrets, sandbox test users): [ISRAEL_INVOICE_SETUP.md](ISRAEL_INVOICE_SETUP.md). The settings page shows which of these are missing.

Required:
- `ISRAEL_INVOICE_CLIENT_ID`
- `ISRAEL_INVOICE_CLIENT_SECRET`
- `ISRAEL_INVOICE_SCOPE` — `scope` in the Tax Authority's official examples
- `ISRAEL_INVOICE_REDIRECT_URI`
- `ISRAEL_INVOICE_OAUTH_STATE_SECRET`
- `ISRAEL_INVOICE_TOKEN_ENCRYPTION_KEY` — base64 for exactly 32 random bytes
- `SUPABASE_SERVICE_ROLE_KEY` — normally provided by Lovable Cloud

Existing Supabase server variables:
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`

Optional:
- `ISRAEL_INVOICE_API_ENVIRONMENT=sandbox` or `production`
- `ISRAEL_INVOICE_API_BASE_URL` for controlled integration testing only.
- `ISRAEL_INVOICE_SOFTWARE_REGISTRATION_NUMBER` — the software registration certificate number (8 digits, as in the Uniform Format; sent as N9) (מספר רישום תוכנה). Until the software is registered, the issuing business's VAT number is sent instead, as the Tax Authority document allows.

Allocation numbers are requested from the Approval V2 service (`/shaam/{tsandbox|production}/Invoices/v2/Approval` on `ita-api.taxes.gov.il`), per "מודל חשבוניות ישראל — תיאור ה-API's", edition 2.0 (7.2024). OAuth (authorize/token) runs on `openapi.taxes.gov.il`, per the Tax Authority Open API user guide.

OAuth redirect URI must exactly match the URI registered for the InvoiceFlow application with the Tax Authority.

The OAuth token endpoint and authorization endpoint are selected by environment in code. Production credentials must never be used against Sandbox, and Sandbox credentials must never be used against Production.

The same OAuth connection also transmits the Uniform Format files, per "Supplement 1 to the Uniform Format instructions" (תוספת מס' 1, 3.2026): `UniStructFileUploadLinksApi/v1/UploadingFile/GetUrlsForUploadingFiles` and `FilesStatusApi/v1/Files/get-file-status` (see `src/lib/uniform-transmission.ts`). The InvoiceFlow application in the Tax Authority developer portal must be subscribed to these two APIs as well. As of the March 2026 edition only the Sandbox was open; in the Sandbox only PDF files up to 1 MB are accepted.
