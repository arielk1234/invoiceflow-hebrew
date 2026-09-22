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

create or replace function public.get_tax_authority_connection_status(
  _business_id uuid,
  _environment text
)
returns table (
  connected boolean,
  environment text,
  connected_at timestamptz,
  expires_at timestamptz,
  scope text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_business_role(_business_id, array['owner','admin']::public.business_role[]) then
    raise exception 'FORBIDDEN';
  end if;

  return query
  select
    true,
    c.environment,
    c.created_at,
    c.access_token_expires_at,
    c.scope
  from public.tax_authority_connections c
  where c.business_id = _business_id
    and c.environment = _environment
    and c.provider = 'israel_tax_authority'
  limit 1;
end;
$$;

revoke all on function public.get_tax_authority_connection_status(uuid,text) from public;
grant execute on function public.get_tax_authority_connection_status(uuid,text) to authenticated;
