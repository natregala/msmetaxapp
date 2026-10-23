-- Additive business profile changes. Financial records and their acceptance
-- operation remain unchanged. NULL activity means it was not supplied.
alter table public.businesses
  add column activity text check (activity in ('products', 'services', 'both', 'other')),
  add column setup_completed_at timestamptz,
  add column profile_revision integer not null default 1 check (profile_revision > 0);

-- Existing owners have already created usable businesses. Do not send them
-- back through setup or invent a business activity for them.
update public.businesses set setup_completed_at = created_at where setup_completed_at is null;
alter table public.businesses alter column setup_completed_at set default now();

-- The creation request is immutable even if the current business is renamed.
-- Its stable business UUID is also the guided-creation operation identifier.
create table app_private.business_setup_receipts (
  business_id uuid primary key references public.businesses(id) on delete restrict,
  actor_id uuid not null references auth.users(id) on delete restrict,
  initial_name text not null check (char_length(initial_name) between 1 and 100 and initial_name = btrim(initial_name)),
  initial_activity text not null check (initial_activity in ('products', 'services', 'both', 'other')),
  accepted_at timestamptz not null default now()
);
create index business_setup_receipts_actor_idx on app_private.business_setup_receipts(actor_id);
alter table app_private.business_setup_receipts enable row level security;
revoke all on app_private.business_setup_receipts from public, anon, authenticated;

create function app_private.create_guided_business(p_business_id uuid, p_name text, p_activity text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_business public.businesses%rowtype;
  v_receipt app_private.business_setup_receipts%rowtype;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'UNAUTHENTICATED';
  end if;
  if p_business_id is null or p_name is null or char_length(p_name) not between 1 and 100
    or p_name <> btrim(p_name) or p_activity is null
    or p_activity not in ('products', 'services', 'both', 'other') then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;

  -- Same lock namespace as legacy create_business: concurrent old/new clients
  -- cannot initialize the same business ID with incompatible requests.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('business:' || p_business_id::text, 0));
  select * into v_business from public.businesses where id = p_business_id for share;
  if found then
    if v_business.owner_id <> v_actor then
      raise exception using errcode = '42501', message = 'FORBIDDEN';
    end if;
    select * into v_receipt from app_private.business_setup_receipts where business_id = p_business_id;
    if not found or v_receipt.actor_id <> v_actor
      or v_receipt.initial_name <> p_name or v_receipt.initial_activity <> p_activity then
      raise exception using errcode = 'P0001', message = 'OPERATION_CONFLICT';
    end if;
  else
    insert into public.businesses(id, owner_id, name, activity, setup_completed_at)
      values (p_business_id, v_actor, p_name, p_activity, now()) returning * into v_business;
    insert into app_private.business_setup_receipts(business_id, actor_id, initial_name, initial_activity)
      values (p_business_id, v_actor, p_name, p_activity);
  end if;

  -- A compatible creation retry returns the current profile. It never undoes
  -- a later rename or replaces that newer profile with the original name.
  return jsonb_build_object(
    'id', v_business.id, 'name', v_business.name, 'activity', v_business.activity,
    'setupCompleted', v_business.setup_completed_at is not null,
    'profileRevision', v_business.profile_revision
  );
end;
$$;

create function app_private.rename_business(p_business_id uuid, p_name text, p_expected_revision integer)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_business public.businesses%rowtype;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'UNAUTHENTICATED';
  end if;
  if p_business_id is null or p_name is null or char_length(p_name) not between 1 and 100
    or p_name <> btrim(p_name) or p_expected_revision is null or p_expected_revision < 1 then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;
  -- Profile updates serialize on the business row. This also respects the share
  -- lock used during financial acceptance and guided-creation replay.
  select * into v_business from public.businesses
    where id = p_business_id and owner_id = v_actor for update;
  if not found then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  if v_business.profile_revision <> p_expected_revision then
    raise exception using errcode = 'P0001', message = 'PROFILE_CONFLICT';
  end if;
  if v_business.name <> p_name then
    update public.businesses set name = p_name, profile_revision = profile_revision + 1
      where id = p_business_id returning * into v_business;
  end if;
  return jsonb_build_object(
    'id', v_business.id, 'name', v_business.name, 'activity', v_business.activity,
    'setupCompleted', v_business.setup_completed_at is not null,
    'profileRevision', v_business.profile_revision
  );
end;
$$;

create function public.create_guided_business(p_business_id uuid, p_name text, p_activity text)
returns jsonb language sql security invoker set search_path = ''
as $$ select app_private.create_guided_business(p_business_id, p_name, p_activity); $$;

create function public.rename_business(p_business_id uuid, p_name text, p_expected_revision integer)
returns jsonb language sql security invoker set search_path = ''
as $$ select app_private.rename_business(p_business_id, p_name, p_expected_revision); $$;

revoke all on function app_private.create_guided_business(uuid,text,text) from public, anon, authenticated;
revoke all on function app_private.rename_business(uuid,text,integer) from public, anon, authenticated;
revoke all on function public.create_guided_business(uuid,text,text) from public, anon, authenticated;
revoke all on function public.rename_business(uuid,text,integer) from public, anon, authenticated;
grant execute on function app_private.create_guided_business(uuid,text,text) to authenticated;
grant execute on function app_private.rename_business(uuid,text,integer) to authenticated;
grant execute on function public.create_guided_business(uuid,text,text) to authenticated;
grant execute on function public.rename_business(uuid,text,integer) to authenticated;

comment on column public.businesses.activity is 'Broad owner-selected business activity. NULL means not supplied; this is not a tax classification.';
comment on column public.businesses.setup_completed_at is 'Completion of this app business profile, not external registration or compliance evidence.';
comment on column public.businesses.profile_revision is 'Optimistic concurrency version for profile edits, independent of financial record revisions.';
