# Israel Tax Authority API environment

These values are server-side secrets/configuration. Never expose them through Vite/React variables and never commit real values.

Required:
- `ISRAEL_INVOICE_CLIENT_ID`
- `ISRAEL_INVOICE_CLIENT_SECRET`
- `ISRAEL_INVOICE_SCOPE`
- `ISRAEL_INVOICE_REDIRECT_URI`
- `ISRAEL_INVOICE_OAUTH_STATE_SECRET`
- `ISRAEL_INVOICE_TOKEN_ENCRYPTION_KEY` — base64 for exactly 32 random bytes
- `SUPABASE_SERVICE_ROLE_KEY`

Existing Supabase server variables:
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`

Optional:
- `ISRAEL_INVOICE_API_ENVIRONMENT=sandbox` or `production`
- `ISRAEL_INVOICE_API_BASE_URL` for controlled integration testing only.

OAuth redirect URI must exactly match the URI registered for the InvoiceFlow application with the Tax Authority.

The OAuth token endpoint and authorization endpoint are selected by environment in code. Production credentials must never be used against Sandbox, and Sandbox credentials must never be used against Production.
