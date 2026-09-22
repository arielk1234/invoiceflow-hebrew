-- Tax Authority request ledger helpers.
-- These SECURITY DEFINER functions keep request-state transitions server-controlled
-- while preserving business membership isolation.

create or replace function public.begin_tax_authority_request(
  _document_id uuid,
  _idempotency_key text
)
returns public.tax_authority_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc public.documents;
  v_request public.tax_authority_requests;
begin
  select * into v_doc from public.documents where id = _document_id for update;
  if not found then raise exception 'DOCUMENT_NOT_FOUND'; end if;

  if not public.has_business_role(v_doc.business_id, array['owner','admin','user']::public.business_role[]) then
    raise exception 'FORBIDDEN';
  end if;

  if v_doc.status <> 'draft' then
    raise exception 'DOCUMENT_NOT_DRAFT';
  end if;

  if nullif(trim(_idempotency_key), '') is null then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED';
  end if;

  insert into public.tax_authority_requests (
    business_id, document_id, request_kind, idempotency_key, status
  )
  values (
    v_doc.business_id, v_doc.id, 'allocation_number', trim(_idempotency_key), 'pending'
  )
  on conflict (business_id, idempotency_key) do nothing;

  select * into v_request
  from public.tax_authority_requests
  where business_id = v_doc.business_id
    and idempotency_key = trim(_idempotency_key)
  limit 1;

  return v_request;
end;
$$;

create or replace function public.update_tax_authority_request(
  _request_id uuid,
  _status text,
  _external_reference text default null,
  _response_payload jsonb default null,
  _error_code text default null,
  _error_message text default null
)
returns public.tax_authority_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.tax_authority_requests;
begin
  select * into v_request
  from public.tax_authority_requests
  where id = _request_id
  for update;

  if not found then raise exception 'TAX_AUTHORITY_REQUEST_NOT_FOUND'; end if;

  if not public.has_business_role(v_request.business_id, array['owner','admin','user']::public.business_role[]) then
    raise exception 'FORBIDDEN';
  end if;

  if _status not in ('pending','submitted','approved','rejected','failed') then
    raise exception 'INVALID_TAX_AUTHORITY_REQUEST_STATUS';
  end if;

  update public.tax_authority_requests
     set status = _status,
         external_reference = _external_reference,
         response_payload = _response_payload,
         error_code = _error_code,
         error_message = _error_message,
         updated_at = now()
   where id = _request_id
   returning * into v_request;

  return v_request;
end;
$$;

revoke all on function public.begin_tax_authority_request(uuid,text) from public;
revoke all on function public.update_tax_authority_request(uuid,text,text,jsonb,text,text) from public;
grant execute on function public.begin_tax_authority_request(uuid,text) to authenticated;
grant execute on function public.update_tax_authority_request(uuid,text,text,jsonb,text,text) to authenticated;
