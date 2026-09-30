-- InvoiceFlow: reconcile the compliance migrations with the base schema
-- (drizzle/migrations/0001_multitenant_invoicing.sql).
--
-- Found by applying every migration to Postgres and running an invoicing
-- scenario as authenticated users:
--   * creating any document failed: next_document_number had a 2-argument and a
--     3-argument version, so the insert trigger's call was ambiguous;
--   * drafts were numbered on insert and the update trigger pinned the number,
--     so the number chosen at issuance was discarded and drafts left gaps;
--   * log_audit was called with its arguments in the wrong order;
--   * digest() is not on the search path on Supabase (pgcrypto lives in the
--     extensions schema); the built-in sha256() needs no extension;
--   * the new tables had no grants.
-- It also records the decision sent to the Tax Authority when it holds an
-- invoice (Israel Invoice API document, edition 2.0, section 4).
-- Idempotent, so it is safe whether or not the earlier migrations already ran.

-- ============ ALLOCATION DECISIONS ============
-- Set only by the server (service role) after the Tax Authority accepted it.
alter table public.documents
  add column if not exists allocation_decision text
    check (allocation_decision in ('continue', 'cancel', 'further_objection')),
  add column if not exists allocation_decision_at timestamptz;

-- ============ NUMBERING ============
-- Keep only the 3-argument version (its _year has a default).
drop function if exists public.next_document_number(uuid, public.doc_type);

-- Same sequence as before; a business without a prefix now gets "INV-2026-000001"
-- instead of "INV-INV-2026-000001".
create or replace function public.next_document_number(
  _business_id uuid,
  _type public.doc_type,
  _year integer default extract(year from current_date)::integer
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_last integer;
  v_prefix text;
begin
  if not public.has_business_role(_business_id, array['owner','admin','user']::public.business_role[]) then
    raise exception 'FORBIDDEN';
  end if;
  if _year < 2000 or _year > 2100 then raise exception 'INVALID_YEAR'; end if;

  select trim(document_prefix) into v_prefix from public.businesses where id = _business_id;
  if not found then raise exception 'BUSINESS_NOT_FOUND'; end if;

  insert into public.document_sequences (business_id, doc_type, year, last_number)
  values (_business_id, _type, _year, 0)
  on conflict (business_id, doc_type, year) do nothing;

  update public.document_sequences
     set last_number = last_number + 1
   where business_id = _business_id and doc_type = _type and year = _year
  returning last_number into v_last;

  return concat_ws('-',
    nullif(v_prefix, ''),
    case _type when 'invoice' then 'INV' when 'receipt' then 'REC' when 'credit_note' then 'CN' end,
    _year,
    lpad(v_last::text, 6, '0'));
end;
$$;
-- Called only from issue_document/reserve_document_number, so users cannot burn numbers.
revoke all on function public.next_document_number(uuid, public.doc_type, integer) from public, anon, authenticated;

-- Drafts carry no number; one is assigned when the document is reserved or issued.
create or replace function public.documents_assign_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.created_by := auth.uid();
  new.number := '';
  return new;
end;
$$;

-- Several drafts may now share the empty number; issued numbers stay unique.
alter table public.documents drop constraint if exists documents_business_id_number_key;
create unique index if not exists documents_business_number_unique
  on public.documents (business_id, number)
  where number <> '';

-- API users (the authenticated/anon roles) cannot set numbers or allocation
-- decisions, or issue/cancel by a direct update; issue_document and
-- cancel_document run as the function owner.
create or replace function public.documents_guard_update()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_api_user boolean := current_user in ('authenticated', 'anon');
begin
  new.updated_at := now();
  new.business_id := old.business_id;
  new.created_by := old.created_by;
  if v_api_user then
    new.number := old.number;
    new.allocation_decision := old.allocation_decision;
    new.allocation_decision_at := old.allocation_decision_at;
  end if;

  if old.status <> 'draft' then
    if new.status = 'draft' then raise exception 'DOCUMENT_LOCKED'; end if;
    if new.type <> old.type or new.client_id <> old.client_id
       or new.issue_date <> old.issue_date or new.due_date <> old.due_date
       or new.vat_rate <> old.vat_rate then
      raise exception 'DOCUMENT_LOCKED';
    end if;
  end if;

  if new.status <> old.status then
    if v_api_user and not (old.status in ('issued','sent','paid') and new.status in ('sent','paid')) then
      raise exception 'INVALID_STATUS_TRANSITION';
    end if;
    if new.status = 'cancelled' then new.cancelled_at := now(); end if;
    if old.status = 'draft' then new.issued_at := now(); end if;
    perform public.log_audit(old.business_id, 'status_change', 'document', old.id,
      jsonb_build_object('from', old.status, 'to', new.status));
  end if;
  return new;
end;
$$;

-- A draft whose number was already sent to the Tax Authority must stay on record.
create or replace function public.documents_guard_delete()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status <> 'draft' then raise exception 'ISSUED_DOCUMENT_CANNOT_BE_DELETED'; end if;
  if exists (select 1 from public.tax_authority_requests r where r.document_id = old.id) then
    raise exception 'DRAFT_REPORTED_TO_TAX_AUTHORITY';
  end if;
  perform public.log_audit(old.business_id, 'delete', 'document', old.id, '{}'::jsonb);
  return old;
end;
$$;

-- ============ TOTALS ============
-- VAT is calculated on the rounded subtotal and the total is their sum, matching
-- the amounts sent to the Tax Authority (src/lib/israel-invoice-functions.ts).
create or replace function public.calculate_document_totals(p_document_id uuid)
returns table(subtotal numeric, vat_amount numeric, total_amount numeric)
language sql
stable
security invoker
set search_path = public
as $$
  with base as (
    select round(coalesce(sum(i.quantity * i.unit_price), 0)::numeric, 2) as subtotal, d.vat_rate
    from public.documents d
    left join public.document_items i on i.document_id = d.id
    where d.id = p_document_id
    group by d.id, d.vat_rate
  )
  select subtotal,
         round(subtotal * vat_rate / 100, 2),
         subtotal + round(subtotal * vat_rate / 100, 2)
  from base;
$$;

-- ============ RESERVE / ISSUE / CANCEL ============
create or replace function public.reserve_document_number(_document_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc public.documents;
  v_number text;
begin
  select * into v_doc from public.documents where id = _document_id for update;
  if not found then raise exception 'DOCUMENT_NOT_FOUND'; end if;
  if not public.has_business_role(v_doc.business_id, array['owner','admin','user']::public.business_role[]) then
    raise exception 'FORBIDDEN';
  end if;

  if coalesce(trim(v_doc.number), '') <> '' then return v_doc.number; end if;
  if v_doc.status <> 'draft' then raise exception 'DOCUMENT_NUMBER_MISSING'; end if;

  v_number := public.next_document_number(v_doc.business_id, v_doc.type, extract(year from v_doc.issue_date)::integer);
  update public.documents set number = v_number where id = v_doc.id;

  perform public.log_audit(v_doc.business_id, 'document.number_reserved', 'document', v_doc.id,
    jsonb_build_object('number', v_number));
  return v_number;
end;
$$;

create or replace function public.issue_document(_document_id uuid)
returns public.documents
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc public.documents;
  v_client public.clients;
  v_business public.businesses;
  v_totals record;
  v_threshold numeric;
  v_payload jsonb;
  v_hash text;
  v_number text;
begin
  select * into v_doc from public.documents where id = _document_id for update;
  if not found then raise exception 'DOCUMENT_NOT_FOUND'; end if;
  if not public.has_business_role(v_doc.business_id, array['owner','admin','user']::public.business_role[]) then
    raise exception 'FORBIDDEN';
  end if;
  if v_doc.status <> 'draft' then raise exception 'DOCUMENT_NOT_DRAFT'; end if;

  select * into v_business from public.businesses where id = v_doc.business_id;
  select * into v_client from public.clients where id = v_doc.client_id and business_id = v_doc.business_id;
  if not found then raise exception 'CLIENT_NOT_FOUND'; end if;

  if v_doc.type in ('invoice','credit_note') and v_business.business_type = 'osek_patur' then
    raise exception 'EXEMPT_BUSINESS_CANNOT_ISSUE_TAX_INVOICE';
  end if;
  if v_doc.type = 'credit_note' and v_doc.related_document_id is null then
    raise exception 'CREDIT_NOTE_REQUIRES_RELATED_DOCUMENT';
  end if;

  select * into v_totals from public.calculate_document_totals(_document_id);
  if v_totals.subtotal <= 0 then raise exception 'DOCUMENT_TOTAL_MUST_BE_POSITIVE'; end if;
  if v_doc.vat_rate < 0 or v_doc.vat_rate > 100 then raise exception 'INVALID_VAT_RATE'; end if;

  v_threshold := case
    when v_doc.issue_date >= date '2026-06-01' then 5000
    when v_doc.issue_date >= date '2026-01-01' then 10000
    else 20000
  end;
  -- After the Tax Authority held the invoice, "continue" and "cancel" let it be
  -- issued without a number (section 4 of the Israel Invoice API document).
  if v_doc.type = 'invoice'
     and v_totals.subtotal > v_threshold
     and v_doc.vat_rate > 0
     and v_client.is_vat_registered
     and v_doc.allocation_requested
     and coalesce(trim(v_doc.allocation_number), '') = ''
     and coalesce(v_doc.allocation_decision, '') not in ('continue', 'cancel') then
    raise exception 'ALLOCATION_NUMBER_REQUIRED';
  end if;

  -- Reuse a number already reserved for an allocation request.
  v_number := coalesce(nullif(trim(v_doc.number), ''),
    public.next_document_number(v_doc.business_id, v_doc.type, extract(year from v_doc.issue_date)::integer));

  v_payload := jsonb_build_object(
    'id', v_doc.id,
    'business_id', v_doc.business_id,
    'type', v_doc.type,
    'number', v_number,
    'client_id', v_doc.client_id,
    'issue_date', v_doc.issue_date,
    'due_date', v_doc.due_date,
    'vat_rate', v_doc.vat_rate,
    'subtotal', v_totals.subtotal,
    'vat_amount', v_totals.vat_amount,
    'total_amount', v_totals.total_amount,
    'allocation_requested', v_doc.allocation_requested,
    'allocation_number', v_doc.allocation_number,
    'allocation_decision', v_doc.allocation_decision,
    'items', coalesce(
      (select jsonb_agg(to_jsonb(i) order by i.position) from public.document_items i where i.document_id = v_doc.id),
      '[]'::jsonb)
  );
  v_hash := encode(sha256(convert_to(v_payload::text, 'UTF8')), 'hex');

  update public.documents
     set number = v_number,
         status = 'issued',
         issued_by = auth.uid(),
         subtotal = v_totals.subtotal,
         vat_amount = v_totals.vat_amount,
         total_amount = v_totals.total_amount,
         content_hash = v_hash
   where id = v_doc.id;

  insert into public.document_snapshots (business_id, document_id, captured_by, payload, content_hash)
  values (v_doc.business_id, v_doc.id, auth.uid(), v_payload, v_hash);

  perform public.log_audit(v_doc.business_id, 'document.issued', 'document', v_doc.id,
    jsonb_build_object('number', v_number, 'content_hash', v_hash));

  -- An abandoned invoice keeps its reported number on record as cancelled.
  if v_doc.allocation_decision = 'cancel' then
    update public.documents
       set status = 'cancelled', cancel_reason = 'בוטלה לאחר שרשות המסים לא אישרה מספר הקצאה'
     where id = v_doc.id;
    perform public.log_audit(v_doc.business_id, 'document.cancelled', 'document', v_doc.id,
      jsonb_build_object('reason', 'allocation_decision_cancel'));
  end if;

  select * into v_doc from public.documents where id = v_doc.id;
  return v_doc;
end;
$$;

create or replace function public.cancel_document(_document_id uuid, _reason text default '')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc public.documents;
begin
  select * into v_doc from public.documents where id = _document_id for update;
  if not found then raise exception 'DOCUMENT_NOT_FOUND'; end if;
  if not public.has_business_role(v_doc.business_id, array['owner','admin']::public.business_role[]) then
    raise exception 'FORBIDDEN';
  end if;
  if v_doc.status = 'draft' then raise exception 'DRAFT_MUST_BE_DELETED_NOT_CANCELLED'; end if;
  if v_doc.status = 'cancelled' then return; end if;

  update public.documents
     set status = 'cancelled', cancel_reason = nullif(trim(_reason), '')
   where id = _document_id;

  perform public.log_audit(v_doc.business_id, 'document.cancelled', 'document', v_doc.id,
    jsonb_build_object('reason', nullif(trim(_reason), '')));
end;
$$;

revoke all on function public.reserve_document_number(uuid) from public, anon;
revoke all on function public.issue_document(uuid) from public, anon;
revoke all on function public.cancel_document(uuid, text) from public, anon;
grant execute on function public.reserve_document_number(uuid) to authenticated;
grant execute on function public.issue_document(uuid) to authenticated;
grant execute on function public.cancel_document(uuid, text) to authenticated;

-- ============ GRANTS ============
grant select on public.document_snapshots to authenticated;
grant all on public.document_snapshots to service_role;
grant select on public.tax_authority_requests to authenticated;
grant all on public.tax_authority_requests to service_role;
revoke all on public.document_snapshots, public.tax_authority_requests from anon;

-- OAuth tokens are read only by the server (service role); the UI uses
-- get_tax_authority_connection_status, which never returns ciphertext.
revoke all on public.tax_authority_connections from anon, authenticated;
grant all on public.tax_authority_connections to service_role;
