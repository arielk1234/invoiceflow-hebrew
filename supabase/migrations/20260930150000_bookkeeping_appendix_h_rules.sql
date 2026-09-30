-- InvoiceFlow: requirements of the Income Tax bookkeeping instructions
-- (הוראות מס הכנסה (ניהול פנקסי חשבונות), התשל"ג-1973) for issued documents.
--   * Appendix H (נספח ה׳) (a)(4): a printed document carries "מקור" on one copy
--     only and "העתק" on every other copy. Prints are recorded by
--     record_document_print, which API users cannot bypass.
--   * Section 9, credit note: states the reason for changing the invoice amount.
--   * Section 9, invoice: states the unit by which the quantity is measured.
-- Idempotent.

alter table public.documents
  add column if not exists credit_reason text,
  add column if not exists original_printed_at timestamptz,
  add column if not exists print_count integer not null default 0;

alter table public.document_items
  add column if not exists unit text not null default 'יחידה';

create or replace function public.documents_bookkeeping_rules()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Print tracking is written only by record_document_print (the function owner).
  if current_user in ('authenticated', 'anon') then
    if TG_OP = 'INSERT' then
      new.original_printed_at := null;
      new.print_count := 0;
      return new;
    end if;
    new.original_printed_at := old.original_printed_at;
    new.print_count := old.print_count;
  end if;
  if TG_OP = 'INSERT' then return new; end if;

  if old.status = 'draft' and new.status <> 'draft'
     and new.type = 'credit_note' and coalesce(trim(new.credit_reason), '') = '' then
    raise exception 'CREDIT_REASON_REQUIRED';
  end if;
  if old.status <> 'draft' and new.credit_reason is distinct from old.credit_reason then
    raise exception 'ISSUED_DOCUMENT_IMMUTABLE';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_documents_bookkeeping_rules on public.documents;
create trigger trg_documents_bookkeeping_rules
before insert or update on public.documents
for each row execute function public.documents_bookkeeping_rules();

-- Returns the marking for this print: "מקור" the first time, "העתק" afterwards.
create or replace function public.record_document_print(_document_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc public.documents;
  v_label text;
begin
  select * into v_doc from public.documents where id = _document_id for update;
  if not found then raise exception 'DOCUMENT_NOT_FOUND'; end if;
  if not public.is_business_member(v_doc.business_id) then raise exception 'FORBIDDEN'; end if;
  -- A draft is not a document; its output is marked "טיוטה" instead (appendix H (a)(3)).
  if v_doc.status = 'draft' then raise exception 'DRAFT_IS_NOT_A_DOCUMENT'; end if;

  v_label := case when v_doc.original_printed_at is null then 'מקור' else 'העתק' end;
  update public.documents
     set original_printed_at = coalesce(original_printed_at, now()),
         print_count = print_count + 1
   where id = v_doc.id;

  perform public.log_audit(v_doc.business_id, 'document.printed', 'document', v_doc.id,
    jsonb_build_object('copy', v_label, 'print', v_doc.print_count + 1));
  return v_label;
end;
$$;

revoke all on function public.record_document_print(uuid) from public, anon;
grant execute on function public.record_document_print(uuid) to authenticated;
