-- Israel Invoices 2026: make the allocation-number conditions explicit in the database.
-- Source: Tax Authority VAT execution instruction 01/2025 and current 2026 guidance.
-- This migration does not implement or invent the Tax Authority API itself.

alter table public.clients
  add column if not exists is_registered_dealer boolean not null default false;

alter table public.documents
  add column if not exists allocation_requested boolean not null default false;

alter table public.documents
  drop constraint if exists documents_allocation_number_format;

alter table public.documents
  add constraint documents_allocation_number_format
  check (allocation_number is null or allocation_number ~ '^[0-9]{9}$');

create or replace function public.allocation_threshold_for_date(p_issue_date date)
returns numeric
language sql
immutable
as $$
  select case
    when p_issue_date >= date '2026-06-01' then 5000
    when p_issue_date >= date '2026-01-01' then 10000
    else 20000
  end::numeric;
$$;

create or replace function public.issue_document(p_document_id uuid)
returns public.documents
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc public.documents;
  v_client public.clients;
  v_business public.businesses;
  v_subtotal numeric;
  v_hash text;
  v_snapshot jsonb;
  v_threshold numeric;
begin
  select * into v_doc
  from public.documents
  where id = p_document_id
  for update;

  if not found then raise exception 'document_not_found'; end if;
  if not public.has_business_role(v_doc.business_id, array['owner','admin']::public.member_role[]) then raise exception 'forbidden'; end if;
  if v_doc.status <> 'draft' then raise exception 'document_not_draft'; end if;
  if v_doc.client_id is null then raise exception 'client_required'; end if;

  select * into v_client
  from public.clients
  where id = v_doc.client_id and business_id = v_doc.business_id;
  if not found then raise exception 'client_not_found_for_business'; end if;

  select * into v_business from public.businesses where id = v_doc.business_id;
  if not found then raise exception 'business_not_found'; end if;

  if not exists (select 1 from public.document_items where document_id = v_doc.id) then raise exception 'items_required'; end if;
  if v_doc.type in ('invoice','credit_note') and v_business.business_type = 'exempt' then raise exception 'exempt_business_cannot_issue_invoice'; end if;
  if v_doc.type = 'credit_note' and v_doc.related_document_id is null then raise exception 'related_document_required'; end if;
  if v_doc.type <> 'receipt' and (v_doc.vat_rate < 0 or v_doc.vat_rate > 100) then raise exception 'invalid_vat_rate'; end if;

  v_subtotal := public.document_subtotal(v_doc.id);
  v_threshold := public.allocation_threshold_for_date(v_doc.issue_date);

  -- Mandatory allocation applies only when all relevant conditions are met:
  -- tax invoice + non-zero VAT + registered-dealer recipient + recipient requested
  -- an allocation number + amount above the statutory threshold.
  if v_doc.type = 'invoice'
     and v_doc.vat_rate > 0
     and v_client.is_registered_dealer
     and v_doc.allocation_requested
     and v_subtotal > v_threshold
     and nullif(trim(v_doc.allocation_number), '') is null then
    raise exception 'allocation_number_required';
  end if;

  v_hash := encode(
    digest(convert_to(row_to_json(v_doc)::text, 'UTF8'), 'sha256'),
    'hex'
  );

  v_snapshot := jsonb_build_object(
    'document', to_jsonb(v_doc),
    'items', coalesce(
      (select jsonb_agg(to_jsonb(i) order by i.position)
       from public.document_items i
       where i.document_id = v_doc.id),
      '[]'::jsonb
    )
  );

  update public.documents
  set status = 'issued', issued_at = now(), document_hash = v_hash
  where id = p_document_id
  returning * into v_doc;

  insert into public.document_snapshots(document_id, snapshot, document_hash)
  values (p_document_id, v_snapshot, v_hash);

  insert into public.audit_events(
    business_id, document_id, actor_user_id, action, document_hash, metadata
  )
  values (
    v_doc.business_id,
    v_doc.id,
    auth.uid(),
    'issued',
    v_hash,
    jsonb_build_object(
      'allocation_requested', v_doc.allocation_requested,
      'allocation_number_present', v_doc.allocation_number is not null
    )
  );

  return v_doc;
end;
$$;
