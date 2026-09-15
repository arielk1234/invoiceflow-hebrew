-- InvoiceFlow: document numbering is tenant-scoped.
-- Every business has its own independent sequence for each document type/year.
-- The business prefix is read from businesses.document_prefix; no sequence is shared between tenants.

create or replace function public.next_document_number(
  p_business_id uuid,
  p_type public.document_type,
  p_year integer
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next bigint;
  v_prefix text;
begin
  if not public.has_business_role(
    p_business_id,
    array['owner','admin']::public.member_role[]
  ) then
    raise exception 'forbidden';
  end if;

  if p_year < 2000 or p_year > 2200 then
    raise exception 'invalid_year';
  end if;

  insert into public.document_sequences(business_id, document_type, year, last_number)
  values (p_business_id, p_type, p_year, 0)
  on conflict (business_id, document_type, year) do nothing;

  select last_number + 1
    into v_next
    from public.document_sequences
   where business_id = p_business_id
     and document_type = p_type
     and year = p_year
   for update;

  update public.document_sequences
     set last_number = v_next
   where business_id = p_business_id
     and document_type = p_type
     and year = p_year;

  select nullif(trim(document_prefix), '')
    into v_prefix
    from public.businesses
   where id = p_business_id;

  if v_prefix is null then
    raise exception 'business_not_found';
  end if;

  -- Prefix is business-specific. Document type remains visible in the number
  -- where the product convention requires it, but the sequence itself is
  -- always isolated by business + type + year.
  v_prefix := case p_type
    when 'receipt' then v_prefix || '-K-' || p_year || '-'
    when 'credit_note' then v_prefix || '-CN-' || p_year || '-'
    else v_prefix || '-' || p_year || '-'
  end;

  return v_prefix || lpad(v_next::text, 3, '0');
end;
$$;

-- Defense in depth: the uniqueness constraint is already tenant-scoped.
-- Keep this explicit so future schema changes cannot accidentally make
-- document numbers globally unique.
drop index if exists public.documents_number_unique_global;

comment on table public.document_sequences is
  'Independent accounting-document counters per business, document type and year.';
comment on column public.businesses.document_prefix is
  'Business-specific document numbering prefix; never shared as a global sequence.';
