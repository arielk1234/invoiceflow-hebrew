create table if not exists public.tax_authority_connections (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  provider text not null default 'israel_tax_authority',
  environment text not null default 'sandbox' check (environment in ('sandbox','production')),
  access_token_ciphertext text,
  refresh_token_ciphertext text,
  access_token_expires_at timestamptz,
  scope text,
  connected_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, provider, environment)
);

alter table public.tax_authority_connections enable row level security;

create policy "business members can view tax authority connection metadata"
on public.tax_authority_connections
for select to authenticated
using (public.has_business_role(business_id, array['owner','admin']::public.business_role[]));

create policy "business admins can insert tax authority connection"
on public.tax_authority_connections
for insert to authenticated
with check (public.has_business_role(business_id, array['owner','admin']::public.business_role[]));

create policy "business admins can update tax authority connection"
on public.tax_authority_connections
for update to authenticated
using (public.has_business_role(business_id, array['owner','admin']::public.business_role[]))
with check (public.has_business_role(business_id, array['owner','admin']::public.business_role[]));

create or replace function public.upsert_tax_authority_connection(
  _business_id uuid,
  _environment text,
  _access_token_ciphertext text,
  _refresh_token_ciphertext text,
  _access_token_expires_at timestamptz,
  _scope text
)
returns public.tax_authority_connections
language plpgsql
security definer
set search_path = public
as $$
declare v_row public.tax_authority_connections;
begin
  if not public.has_business_role(_business_id, array['owner','admin']::public.business_role[]) then
    raise exception 'FORBIDDEN';
  end if;

  insert into public.tax_authority_connections (
    business_id, environment, access_token_ciphertext, refresh_token_ciphertext,
    access_token_expires_at, scope, connected_by
  )
  values (
    _business_id, _environment, _access_token_ciphertext, _refresh_token_ciphertext,
    _access_token_expires_at, _scope, auth.uid()
  )
  on conflict (business_id, provider, environment)
  do update set
    access_token_ciphertext = excluded.access_token_ciphertext,
    refresh_token_ciphertext = coalesce(excluded.refresh_token_ciphertext, public.tax_authority_connections.refresh_token_ciphertext),
    access_token_expires_at = excluded.access_token_expires_at,
    scope = excluded.scope,
    connected_by = auth.uid(),
    updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.upsert_tax_authority_connection(uuid,text,text,text,timestamptz,text) from public;
grant execute on function public.upsert_tax_authority_connection(uuid,text,text,text,timestamptz,text) to authenticated;
