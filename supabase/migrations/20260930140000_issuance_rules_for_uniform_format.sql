-- InvoiceFlow: rules the Uniform Format ("מבנה אחיד" 1.31) and the Tax Authority's
-- simulator enforce on issued documents.
--   * A receipt paid by cheque records bank, branch, account and cheque number
--     (record D120, fields 1307-1310).
--   * A document cannot be issued with a date after the day of issue (fields 1230,
--     1272, 1322: "the date cannot be in the future").
-- Idempotent.

alter table public.documents
  add column if not exists cheque_bank text,
  add column if not exists cheque_branch text,
  add column if not exists cheque_account text,
  add column if not exists cheque_number text;

create or replace function public.documents_issuance_rules()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status = 'draft' and new.status <> 'draft' then
    if new.issue_date > (now() at time zone 'Asia/Jerusalem')::date then
      raise exception 'ISSUE_DATE_IN_FUTURE';
    end if;
    if new.type = 'receipt' and new.payment_method = 'המחאה' and (
         coalesce(new.cheque_bank, '') !~ '^\d{1,10}$'
      or coalesce(new.cheque_branch, '') !~ '^\d{1,10}$'
      or coalesce(new.cheque_account, '') !~ '^\d{1,15}$'
      or coalesce(new.cheque_number, '') !~ '^\d{1,10}$') then
      raise exception 'CHEQUE_DETAILS_REQUIRED';
    end if;
  end if;

  if old.status <> 'draft' and (
       new.payment_method is distinct from old.payment_method
    or new.cheque_bank is distinct from old.cheque_bank
    or new.cheque_branch is distinct from old.cheque_branch
    or new.cheque_account is distinct from old.cheque_account
    or new.cheque_number is distinct from old.cheque_number) then
    raise exception 'ISSUED_DOCUMENT_IMMUTABLE';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_documents_issuance_rules on public.documents;
create trigger trg_documents_issuance_rules
before update on public.documents
for each row execute function public.documents_issuance_rules();
