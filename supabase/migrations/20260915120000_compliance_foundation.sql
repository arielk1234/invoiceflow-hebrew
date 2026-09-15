-- InvoiceFlow: server-side accounting foundation for Israel registration readiness.
-- This migration is intentionally independent from any unverified Tax Authority API schema.

create extension if not exists pgcrypto;

do $$ begin
  create type public.business_type as enum ('exempt','licensed','company','partnership');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.document_type as enum ('invoice','receipt','credit_note');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.document_status as enum ('draft','issued','sent','paid','cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.member_role as enum ('owner','admin','user');
exception when duplicate_object then null; end $$;

create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  tax_id text not null,
  business_type public.business_type not null default 'licensed',
  vat_rate numeric(5,2) not null default 18 check (vat_rate >= 0 and vat_rate <= 100),
  address text not null default '',
  phone text not null default '',
  email text not null default '',
  document_prefix text not null default 'INV' check (char_length(document_prefix) between 1 and 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.business_members (
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.member_role not null default 'user',
  created_at timestamptz not null default now(),
  primary key (business_id, user_id)
);

create index if not exists business_members_user_idx on public.business_members(user_id);

create or replace function public.is_business_member(p_business_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.business_members bm
    where bm.business_id = p_business_id and bm.user_id = auth.uid()
  );
$$;

create or replace function public.has_business_role(p_business_id uuid, p_roles public.member_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.business_members bm
    where bm.business_id = p_business_id
      and bm.user_id = auth.uid()
      and bm.role = any(p_roles)
  );
$$;

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  name text not null,
  tax_id text,
  email text,
  phone text,
  address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists clients_business_idx on public.clients(business_id);

create table if not exists public.document_sequences (
  business_id uuid not null references public.businesses(id) on delete cascade,
  document_type public.document_type not null,
  year integer not null check (year between 2000 and 2200),
  last_number bigint not null default 0 check (last_number >= 0),
  primary key (business_id, document_type, year)
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  type public.document_type not null,
  number text not null,
  client_id uuid references public.clients(id) on delete restrict,
  issue_date date not null,
  due_date date,
  vat_rate numeric(5,2) not null default 18 check (vat_rate >= 0 and vat_rate <= 100),
  status public.document_status not null default 'draft',
  notes text,
  payment_method text,
  created_at timestamptz not null default now(),
  issued_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  related_document_id uuid references public.documents(id) on delete restrict,
  allocation_number text,
  document_hash text,
  constraint documents_number_unique unique (business_id, type, number),
  constraint documents_cancel_fields check (
    (status <> 'cancelled') or (cancelled_at is not null and nullif(trim(cancellation_reason),'') is not null)
  )
);
create index if not exists documents_business_date_idx on public.documents(business_id, issue_date desc);
create index if not exists documents_business_status_idx on public.documents(business_id, status);

create table if not exists public.document_items (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete restrict,
  position integer not null check (position >= 1),
  description text not null,
  quantity numeric(18,4) not null check (quantity > 0),
  unit_price numeric(18,2) not null check (unit_price >= 0),
  created_at timestamptz not null default now(),
  constraint document_items_position_unique unique(document_id, position)
);
create index if not exists document_items_document_idx on public.document_items(document_id);

create table if not exists public.document_snapshots (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete restrict,
  snapshot jsonb not null,
  document_hash text not null,
  created_at timestamptz not null default now()
);
create unique index if not exists document_snapshots_issued_idx on public.document_snapshots(document_id);

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  document_id uuid references public.documents(id) on delete restrict,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  occurred_at timestamptz not null default now(),
  document_hash text,
  metadata jsonb not null default '{}'::jsonb
);
create index if not exists audit_events_business_time_idx on public.audit_events(business_id, occurred_at desc);

create table if not exists public.allocation_numbers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  document_id uuid not null unique references public.documents(id) on delete restrict,
  allocation_number text not null,
  received_at timestamptz not null default now(),
  provider text,
  raw_response jsonb,
  created_at timestamptz not null default now()
);

-- Only server-side functions may issue or cancel accounting documents.
create or replace function public.next_document_number(p_business_id uuid, p_type public.document_type, p_year integer)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_next bigint;
  v_prefix text;
begin
  if not public.has_business_role(p_business_id, array['owner','admin']::public.member_role[]) then
    raise exception 'forbidden';
  end if;
  insert into public.document_sequences(business_id, document_type, year, last_number)
  values (p_business_id, p_type, p_year, 0)
  on conflict (business_id, document_type, year) do nothing;

  select last_number + 1 into v_next
  from public.document_sequences
  where business_id = p_business_id and document_type = p_type and year = p_year
  for update;

  update public.document_sequences
  set last_number = v_next
  where business_id = p_business_id and document_type = p_type and year = p_year;

  v_prefix := case p_type when 'receipt' then 'K-' || p_year || '-' when 'credit_note' then 'CN-' || p_year || '-' else p_year || '-' end;
  return v_prefix || lpad(v_next::text, 3, '0');
end;
$$;

create or replace function public.document_subtotal(p_document_id uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(sum(quantity * unit_price),0) from public.document_items where document_id = p_document_id;
$$;

create or replace function public.issue_document(p_document_id uuid)
returns public.documents language plpgsql security definer set search_path = public as $$
declare
  v_doc public.documents;
  v_subtotal numeric;
  v_hash text;
  v_snapshot jsonb;
begin
  select * into v_doc from public.documents where id = p_document_id for update;
  if not found then raise exception 'document_not_found'; end if;
  if not public.has_business_role(v_doc.business_id, array['owner','admin']::public.member_role[]) then raise exception 'forbidden'; end if;
  if v_doc.status <> 'draft' then raise exception 'document_not_draft'; end if;
  if v_doc.client_id is null then raise exception 'client_required'; end if;
  if not exists (select 1 from public.document_items where document_id = v_doc.id) then raise exception 'items_required'; end if;
  if v_doc.type in ('invoice','credit_note') and exists (select 1 from public.businesses b where b.id=v_doc.business_id and b.business_type='exempt') then raise exception 'exempt_business_cannot_issue_invoice'; end if;
  if v_doc.type='credit_note' and v_doc.related_document_id is null then raise exception 'related_document_required'; end if;

  v_subtotal := public.document_subtotal(v_doc.id);
  -- 2026 threshold is deliberately enforced in the application/provider integration as well.
  -- The database refuses final issuance when a required allocation number has not been stored.
  if v_doc.type='invoice' and v_doc.vat_rate > 0 and v_subtotal > 5000 and nullif(trim(v_doc.allocation_number),'') is null then
    raise exception 'allocation_number_required';
  end if;

  v_hash := encode(digest(convert_to(row_to_json(v_doc)::text,'UTF8'),'sha256'),'hex');
  v_snapshot := jsonb_build_object('document',to_jsonb(v_doc),'items',coalesce((select jsonb_agg(to_jsonb(i) order by i.position) from public.document_items i where i.document_id=v_doc.id),'[]'::jsonb));
  update public.documents set status='issued', issued_at=now(), document_hash=v_hash where id=p_document_id returning * into v_doc;
  insert into public.document_snapshots(document_id,snapshot,document_hash) values(p_document_id,v_snapshot,v_hash);
  insert into public.audit_events(business_id,document_id,actor_user_id,action,document_hash) values(v_doc.business_id,v_doc.id,auth.uid(),'issued',v_hash);
  return v_doc;
end;
$$;

create or replace function public.cancel_document(p_document_id uuid, p_reason text)
returns public.documents language plpgsql security definer set search_path = public as $$
declare v_doc public.documents;
begin
  select * into v_doc from public.documents where id=p_document_id for update;
  if not found then raise exception 'document_not_found'; end if;
  if not public.has_business_role(v_doc.business_id, array['owner','admin']::public.member_role[]) then raise exception 'forbidden'; end if;
  if v_doc.status in ('draft','cancelled') then raise exception 'invalid_cancel_state'; end if;
  if nullif(trim(p_reason),'') is null then raise exception 'cancellation_reason_required'; end if;
  update public.documents set status='cancelled', cancelled_at=now(), cancellation_reason=trim(p_reason) where id=p_document_id returning * into v_doc;
  insert into public.audit_events(business_id,document_id,actor_user_id,action,document_hash,metadata) values(v_doc.business_id,v_doc.id,auth.uid(),'cancelled',v_doc.document_hash,jsonb_build_object('reason',p_reason));
  return v_doc;
end;
$$;

-- Immutability: once a document is issued, its accounting content cannot be changed.
create or replace function public.prevent_issued_document_mutation()
returns trigger language plpgsql as $$
begin
  if old.status <> 'draft' then
    if tg_op='DELETE' then raise exception 'issued_document_cannot_be_deleted'; end if;
    if new.id<>old.id or new.business_id<>old.business_id or new.type<>old.type or new.number<>old.number
      or new.client_id is distinct from old.client_id or new.issue_date<>old.issue_date
      or new.due_date is distinct from old.due_date or new.vat_rate<>old.vat_rate
      or new.notes is distinct from old.notes or new.payment_method is distinct from old.payment_method
      or new.related_document_id is distinct from old.related_document_id
      or new.document_hash is distinct from old.document_hash then
      raise exception 'issued_document_is_immutable';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists documents_immutability on public.documents;
create trigger documents_immutability before update or delete on public.documents for each row execute function public.prevent_issued_document_mutation();

create or replace function public.prevent_issued_item_mutation()
returns trigger language plpgsql as $$
declare v_status public.document_status;
begin
  select status into v_status from public.documents where id=coalesce(new.document_id,old.document_id);
  if v_status <> 'draft' then raise exception 'issued_document_items_are_immutable'; end if;
  return coalesce(new,old);
end;
$$;
drop trigger if exists document_items_immutability on public.document_items;
create trigger document_items_immutability before insert or update or delete on public.document_items for each row execute function public.prevent_issued_item_mutation();

create or replace function public.prevent_snapshot_mutation()
returns trigger language plpgsql as $$ begin raise exception 'document_snapshot_is_immutable'; end; $$;
drop trigger if exists snapshots_immutable on public.document_snapshots;
create trigger snapshots_immutable before update or delete on public.document_snapshots for each row execute function public.prevent_snapshot_mutation();

create or replace function public.prevent_audit_mutation()
returns trigger language plpgsql as $$ begin raise exception 'audit_event_is_immutable'; end; $$;
drop trigger if exists audit_immutable on public.audit_events;
create trigger audit_immutable before update or delete on public.audit_events for each row execute function public.prevent_audit_mutation();

-- RLS: every tenant-visible row is constrained by authenticated business membership.
alter table public.businesses enable row level security;
alter table public.business_members enable row level security;
alter table public.clients enable row level security;
alter table public.documents enable row level security;
alter table public.document_items enable row level security;
alter table public.document_snapshots enable row level security;
alter table public.audit_events enable row level security;
alter table public.allocation_numbers enable row level security;
alter table public.document_sequences enable row level security;

drop policy if exists businesses_member_select on public.businesses;
create policy businesses_member_select on public.businesses for select using (public.is_business_member(id));
drop policy if exists businesses_admin_update on public.businesses;
create policy businesses_admin_update on public.businesses for update using (public.has_business_role(id,array['owner','admin']::public.member_role[]));

drop policy if exists members_self_or_admin on public.business_members;
create policy members_self_or_admin on public.business_members for select using (user_id=auth.uid() or public.has_business_role(business_id,array['owner','admin']::public.member_role[]));

drop policy if exists clients_member_all on public.clients;
create policy clients_member_all on public.clients for all using (public.is_business_member(business_id)) with check (public.is_business_member(business_id));

drop policy if exists documents_member_select on public.documents;
create policy documents_member_select on public.documents for select using (public.is_business_member(business_id));
drop policy if exists documents_draft_write on public.documents;
create policy documents_draft_write on public.documents for insert with check (public.has_business_role(business_id,array['owner','admin']::public.member_role[]));

-- Issuance/cancellation go through security-definer RPCs; direct status mutation is not granted here.
drop policy if exists documents_update_draft on public.documents;
create policy documents_update_draft on public.documents for update using (status='draft' and public.has_business_role(business_id,array['owner','admin']::public.member_role[])) with check (status='draft');

drop policy if exists items_member_select on public.document_items;
create policy items_member_select on public.document_items for select using (exists(select 1 from public.documents d where d.id=document_id and public.is_business_member(d.business_id)));
drop policy if exists items_draft_write on public.document_items;
create policy items_draft_write on public.document_items for all using (exists(select 1 from public.documents d where d.id=document_id and d.status='draft' and public.has_business_role(d.business_id,array['owner','admin']::public.member_role[]))) with check (exists(select 1 from public.documents d where d.id=document_id and d.status='draft' and public.has_business_role(d.business_id,array['owner','admin']::public.member_role[])));

drop policy if exists snapshots_member_select on public.document_snapshots;
create policy snapshots_member_select on public.document_snapshots for select using (exists(select 1 from public.documents d where d.id=document_id and public.is_business_member(d.business_id)));

drop policy if exists audit_member_select on public.audit_events;
create policy audit_member_select on public.audit_events for select using (public.is_business_member(business_id));

drop policy if exists allocation_member_select on public.allocation_numbers;
create policy allocation_member_select on public.allocation_numbers for select using (public.is_business_member(business_id));

drop policy if exists sequence_admin_select on public.document_sequences;
create policy sequence_admin_select on public.document_sequences for select using (public.has_business_role(business_id,array['owner','admin']::public.member_role[]));

revoke all on public.document_sequences from anon, authenticated;
revoke all on public.document_snapshots from anon, authenticated;
revoke all on public.audit_events from anon, authenticated;
grant select on public.document_snapshots, public.audit_events to authenticated;
grant execute on function public.next_document_number(uuid,public.document_type,integer) to authenticated;
grant execute on function public.issue_document(uuid) to authenticated;
grant execute on function public.cancel_document(uuid,text) to authenticated;
