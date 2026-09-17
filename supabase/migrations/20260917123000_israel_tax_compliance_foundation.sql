create extension if not exists pgcrypto;

-- InvoiceFlow: Israeli tax/compliance foundation.
-- This migration adds accounting-document metadata without inventing any
-- Tax Authority API endpoint or Uniform Format schema.

alter type public.doc_type add value if not exists 'credit_note';

alter table public.clients
  add column if not exists is_vat_registered boolean not null default false;

alter table public.documents
  add column if not exists related_document_id uuid references public.documents(id),
  add column if not exists allocation_requested boolean not null default false,
  add column if not exists allocation_number text,
  add column if not exists allocation_requested_at timestamptz,
  add column if not exists subtotal numeric(14,2) not null default 0,
  add column if not exists vat_amount numeric(14,2) not null default 0,
  add column if not exists total_amount numeric(14,2) not null default 0,
  add column if not exists content_hash text,
  add column if not exists issued_by uuid,
  add column if not exists cancel_reason text;

create unique index if not exists documents_business_number_unique
  on public.documents (business_id, number)
  where number <> '';

create index if not exists documents_business_issue_date_idx
  on public.documents (business_id, issue_date, type);

create index if not exists documents_allocation_number_idx
  on public.documents (business_id, allocation_number)
  where allocation_number is not null;

create table if not exists public.document_snapshots (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id),
  document_id uuid not null references public.documents(id),
  snapshot_version integer not null default 1,
  captured_at timestamptz not null default now(),
  captured_by uuid,
  payload jsonb not null,
  content_hash text not null,
  unique (document_id, snapshot_version)
);

create index if not exists document_snapshots_business_idx
  on public.document_snapshots (business_id, captured_at desc);

create table if not exists public.tax_authority_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id),
  document_id uuid not null references public.documents(id),
  request_kind text not null check (request_kind in ('allocation_number','uniform_file','uniform_status')),
  idempotency_key text not null,
  status text not null default 'pending' check (status in ('pending','submitted','approved','rejected','failed')),
  external_reference text,
  response_payload jsonb,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, idempotency_key)
);

create index if not exists tax_authority_requests_document_idx
  on public.tax_authority_requests (business_id, document_id, created_at desc);

create or replace function public.prevent_issued_numbering_prefix_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.document_prefix is distinct from new.document_prefix
     and exists (
       select 1 from public.documents d
       where d.business_id = old.id
         and d.status <> 'draft'
     ) then
    raise exception 'DOCUMENT_PREFIX_LOCKED_AFTER_ISSUANCE';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_business_prefix_immutable on public.businesses;
create trigger trg_business_prefix_immutable
before update on public.businesses
for each row execute function public.prevent_issued_numbering_prefix_change();

create or replace function public.calculate_document_totals(p_document_id uuid)
returns table(subtotal numeric, vat_amount numeric, total_amount numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select
    round(coalesce(sum(i.quantity * i.unit_price), 0)::numeric, 2) as subtotal,
    round((coalesce(sum(i.quantity * i.unit_price), 0) * d.vat_rate / 100)::numeric, 2) as vat_amount,
    round((coalesce(sum(i.quantity * i.unit_price), 0) * (1 + d.vat_rate / 100))::numeric, 2) as total_amount
  from public.documents d
  left join public.document_items i on i.document_id = d.id
  where d.id = p_document_id
  group by d.id, d.vat_rate;
$$;

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
  v_code text;
  v_number text;
begin
  if not public.has_business_role(_business_id, array['owner','admin','user']::public.business_role[]) then
    raise exception 'FORBIDDEN';
  end if;

  if _year < 2000 or _year > 2100 then
    raise exception 'INVALID_YEAR';
  end if;

  select coalesce(nullif(trim(document_prefix), ''), 'INV')
    into v_prefix
  from public.businesses
  where id = _business_id;

  if v_prefix is null then
    raise exception 'BUSINESS_NOT_FOUND';
  end if;

  insert into public.document_sequences (business_id, doc_type, year, last_number)
  values (_business_id, _type, _year, 0)
  on conflict (business_id, doc_type, year) do nothing;

  update public.document_sequences
     set last_number = last_number + 1
   where business_id = _business_id
     and doc_type = _type
     and year = _year
  returning last_number into v_last;

  v_code := case _type
    when 'invoice' then 'INV'
    when 'receipt' then 'REC'
    when 'credit_note' then 'CN'
  end;

  v_number := format('%s-%s-%s-%s', v_prefix, v_code, _year, lpad(v_last::text, 6, '0'));
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
  v_year integer;
  v_number text;
begin
  select * into v_doc
  from public.documents
  where id = _document_id
  for update;

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

  if v_doc.type = 'invoice'
     and v_totals.subtotal > v_threshold
     and v_doc.vat_rate > 0
     and v_client.is_vat_registered
     and v_doc.allocation_requested
     and coalesce(nullif(trim(v_doc.allocation_number), ''), '') = '' then
    raise exception 'ALLOCATION_NUMBER_REQUIRED';
  end if;

  v_year := extract(year from v_doc.issue_date)::integer;
  v_number := public.next_document_number(v_doc.business_id, v_doc.type, v_year);

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
    'items', coalesce((select jsonb_agg(to_jsonb(i) order by i.position) from public.document_items i where i.document_id = v_doc.id), '[]'::jsonb)
  );
  v_hash := encode(digest(v_payload::text, 'sha256'), 'hex');

  update public.documents
     set number = v_number,
         status = 'issued',
         issued_at = now(),
         issued_by = auth.uid(),
         subtotal = v_totals.subtotal,
         vat_amount = v_totals.vat_amount,
         total_amount = v_totals.total_amount,
         content_hash = v_hash,
         updated_at = now()
   where id = v_doc.id;

  insert into public.document_snapshots (business_id, document_id, captured_by, payload, content_hash)
  values (v_doc.business_id, v_doc.id, auth.uid(), v_payload, v_hash);

  perform public.log_audit(
    'document.issued',
    v_doc.business_id,
    'document',
    v_doc.id,
    jsonb_build_object('number', v_number, 'content_hash', v_hash)
  );

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
     set status = 'cancelled', cancelled_at = now(), cancel_reason = nullif(trim(_reason), ''), updated_at = now()
   where id = _document_id;

  perform public.log_audit(
    'document.cancelled', v_doc.business_id, 'document', v_doc.id,
    jsonb_build_object('reason', nullif(trim(_reason), ''))
  );
end;
$$;

create or replace function public.prevent_issued_document_mutation()
returns trigger
language plpgsql
as $$
begin
  if old.status <> 'draft' then
    if new.business_id is distinct from old.business_id
       or new.type is distinct from old.type
       or new.number is distinct from old.number
       or new.client_id is distinct from old.client_id
       or new.issue_date is distinct from old.issue_date
       or new.due_date is distinct from old.due_date
       or new.vat_rate is distinct from old.vat_rate
       or new.subtotal is distinct from old.subtotal
       or new.vat_amount is distinct from old.vat_amount
       or new.total_amount is distinct from old.total_amount
       or new.allocation_number is distinct from old.allocation_number
       or new.content_hash is distinct from old.content_hash
       or new.issued_at is distinct from old.issued_at then
      raise exception 'ISSUED_DOCUMENT_IMMUTABLE';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_issued_document_mutation on public.documents;
create trigger trg_prevent_issued_document_mutation
before update on public.documents
for each row execute function public.prevent_issued_document_mutation();

create or replace function public.prevent_issued_item_mutation()
returns trigger
language plpgsql
as $$
declare
  v_document_id uuid;
  v_status public.doc_status;
begin
  v_document_id := case when TG_OP = 'DELETE' then old.document_id else new.document_id end;
  select status into v_status from public.documents where id = v_document_id;
  if v_status <> 'draft' then raise exception 'ISSUED_DOCUMENT_ITEMS_IMMUTABLE'; end if;
  return case when TG_OP = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists trg_prevent_issued_item_update on public.document_items;
create trigger trg_prevent_issued_item_update
before update or delete on public.document_items
for each row execute function public.prevent_issued_item_mutation();

create or replace function public.prevent_snapshot_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'DOCUMENT_SNAPSHOT_IMMUTABLE';
end;
$$;

drop trigger if exists trg_document_snapshot_immutable on public.document_snapshots;
create trigger trg_document_snapshot_immutable
before update or delete on public.document_snapshots
for each row execute function public.prevent_snapshot_mutation();

alter table public.document_snapshots enable row level security;
alter table public.tax_authority_requests enable row level security;

drop policy if exists "members can read document snapshots" on public.document_snapshots;
create policy "members can read document snapshots"
  on public.document_snapshots for select
  using (public.is_business_member(business_id));

drop policy if exists "members can read tax authority requests" on public.tax_authority_requests;
create policy "members can read tax authority requests"
  on public.tax_authority_requests for select
  using (public.is_business_member(business_id));

drop policy if exists "admins can create tax authority requests" on public.tax_authority_requests;
create policy "admins can create tax authority requests"
  on public.tax_authority_requests for insert
  with check (public.has_business_role(business_id, array['owner','admin']::public.business_role[]));

revoke all on public.document_snapshots from anon;
revoke all on public.tax_authority_requests from anon;

comment on table public.document_snapshots is 'Immutable accounting-document snapshots for audit/compliance. Not a Tax Authority registration certificate.';
comment on table public.tax_authority_requests is 'Integration ledger for Tax Authority services. API endpoint/authentication must be configured from official current specifications; this table does not invent an endpoint.';
