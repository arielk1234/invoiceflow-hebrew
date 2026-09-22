-- InvoiceFlow: safe two-phase document numbering for Tax Authority workflows.
-- A draft gets a stable document number before an external allocation request.
-- This prevents retries from consuming a new document number.

create or replace function public.reserve_document_number(_document_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc public.documents;
  v_year integer;
  v_number text;
begin
  select * into v_doc
  from public.documents
  where id = _document_id
  for update;

  if not found then
    raise exception 'DOCUMENT_NOT_FOUND';
  end if;

  if not public.has_business_role(v_doc.business_id, array['owner','admin','user']::public.business_role[]) then
    raise exception 'FORBIDDEN';
  end if;

  if v_doc.status <> 'draft' then
    if coalesce(v_doc.number, '') = '' then
      raise exception 'DOCUMENT_NUMBER_MISSING';
    end if;
    return v_doc.number;
  end if;

  if coalesce(trim(v_doc.number), '') <> '' then
    return v_doc.number;
  end if;

  v_year := extract(year from v_doc.issue_date)::integer;
  v_number := public.next_document_number(v_doc.business_id, v_doc.type, v_year);

  update public.documents
     set number = v_number,
         updated_at = now()
   where id = v_doc.id;

  perform public.log_audit(
    'document.number_reserved',
    v_doc.business_id,
    'document',
    v_doc.id,
    jsonb_build_object('number', v_number)
  );

  return v_number;
end;
$$;

revoke all on function public.reserve_document_number(uuid) from public;
grant execute on function public.reserve_document_number(uuid) to authenticated;

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
  select * into v_client
    from public.clients
   where id = v_doc.client_id
     and business_id = v_doc.business_id;
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

  -- Reuse a number already reserved for an allocation request.
  -- Only consume a new sequence number when the draft has no number yet.
  if coalesce(trim(v_doc.number), '') <> '' then
    v_number := v_doc.number;
  else
    v_year := extract(year from v_doc.issue_date)::integer;
    v_number := public.next_document_number(v_doc.business_id, v_doc.type, v_year);
  end if;

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
    'items', coalesce(
      (select jsonb_agg(to_jsonb(i) order by i.position)
         from public.document_items i
        where i.document_id = v_doc.id),
      '[]'::jsonb
    )
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

revoke all on function public.issue_document(uuid) from public;
grant execute on function public.issue_document(uuid) to authenticated;
