-- Non-sensitive preparation evidence references are independent of basic onboarding.
-- This migration enables no tax calculation, filing, payment or compliance state.
create table public.preparation_profiles (
  business_id uuid primary key references public.businesses(id) on delete restrict,
  revision integer not null check (revision > 0),
  profile_data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.preparation_profiles enable row level security;
create policy preparation_profiles_owner_read on public.preparation_profiles for select to authenticated
  using (exists(select 1 from public.businesses b where b.id = business_id and b.owner_id = (select auth.uid())));
revoke all on public.preparation_profiles from public, anon, authenticated;
grant select on public.preparation_profiles to authenticated;

create table app_private.preparation_profile_revisions (
  business_id uuid not null references public.businesses(id) on delete restrict,
  revision integer not null,
  profile_data jsonb not null,
  actor_id uuid not null references auth.users(id) on delete restrict,
  recorded_at timestamptz not null default now(),
  primary key (business_id,revision)
);
create table app_private.preparation_profile_receipts (
  business_id uuid not null references public.businesses(id) on delete restrict,
  operation_id uuid not null,
  actor_id uuid not null references auth.users(id) on delete restrict,
  command jsonb not null,
  result jsonb not null,
  primary key (business_id,operation_id)
);
alter table app_private.preparation_profile_revisions enable row level security;
alter table app_private.preparation_profile_receipts enable row level security;
revoke all on app_private.preparation_profile_revisions, app_private.preparation_profile_receipts from public, anon, authenticated;

create function app_private.save_preparation_profile(p_business_id uuid,p_operation_id uuid,p_expected_revision integer,p_values jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_profile public.preparation_profiles%rowtype;
  v_receipt app_private.preparation_profile_receipts%rowtype;
  v_command jsonb;
  v_result jsonb;
  v_key text;
  v_revision integer;
begin
  if v_actor is null then raise exception using errcode='42501',message='UNAUTHENTICATED'; end if;
  if p_business_id is null or p_operation_id is null or p_expected_revision is null or p_expected_revision < 0 or p_expected_revision > 2147483646
    or p_values is null or jsonb_typeof(p_values) <> 'object' then
    raise exception using errcode='22023',message='VALIDATION_FAILED';
  end if;
  perform 1 from public.businesses where id=p_business_id and owner_id=v_actor for share;
  if not found then raise exception using errcode='42501',message='FORBIDDEN'; end if;
  if (select count(*) from jsonb_object_keys(p_values)) <> 9
    or not(p_values ?& array['year','registration','taxTreatment','evidence','priorIncomeCentavos','priorTaxPaymentsCentavos','otherCreditsCentavos','coverage','notes'])
    or jsonb_typeof(p_values->'year') <> 'number' or (p_values->>'year') !~ '^[0-9]{4}$'
    or (p_values->>'year')::integer not between 1900 and 2100
    or coalesce(p_values->>'registration','') not in ('registered','not_registered','unknown')
    or coalesce(p_values->>'taxTreatment','') not in ('eight_percent','graduated','other','unknown')
    or coalesce(p_values->>'coverage','') not in ('complete','partial','unknown')
    or jsonb_typeof(p_values->'evidence') <> 'string' or char_length(p_values->>'evidence') > 1000
    or jsonb_typeof(p_values->'notes') <> 'string' or char_length(p_values->>'notes') > 1000 then
    raise exception using errcode='22023',message='VALIDATION_FAILED';
  end if;
  foreach v_key in array array['priorIncomeCentavos','priorTaxPaymentsCentavos','otherCreditsCentavos'] loop
    if p_values->v_key <> 'null'::jsonb and
      (jsonb_typeof(p_values->v_key) <> 'string' or (p_values->>v_key) !~ '^(0|[1-9][0-9]{0,11})$') then
      raise exception using errcode='22023',message='VALIDATION_FAILED';
    end if;
    if p_values->v_key <> 'null'::jsonb and (p_values->>v_key)::numeric > 999999999999 then
      raise exception using errcode='22023',message='VALIDATION_FAILED';
    end if;
  end loop;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('preparation:'||p_business_id::text,0));
  v_command := jsonb_build_object('expectedRevision',p_expected_revision,'values',p_values);
  select * into v_receipt from app_private.preparation_profile_receipts
    where business_id=p_business_id and operation_id=p_operation_id;
  if found then
    if v_receipt.actor_id <> v_actor or v_receipt.command <> v_command then
      raise exception using errcode='P0001',message='OPERATION_CONFLICT';
    end if;
    return v_receipt.result;
  end if;
  select * into v_profile from public.preparation_profiles where business_id=p_business_id for update;
  if coalesce(v_profile.revision,0) <> p_expected_revision then
    raise exception using errcode='P0001',message='PROFILE_CONFLICT';
  end if;
  v_revision := p_expected_revision+1;
  insert into public.preparation_profiles(business_id,revision,profile_data) values(p_business_id,v_revision,p_values)
    on conflict(business_id) do update set revision=excluded.revision,profile_data=excluded.profile_data,updated_at=now();
  insert into app_private.preparation_profile_revisions(business_id,revision,profile_data,actor_id)
    values(p_business_id,v_revision,p_values,v_actor);
  select jsonb_build_object('revision',revision,'values',profile_data,'updatedAt',updated_at) into v_result
    from public.preparation_profiles where business_id=p_business_id;
  insert into app_private.preparation_profile_receipts(business_id,operation_id,actor_id,command,result)
    values(p_business_id,p_operation_id,v_actor,v_command,v_result);
  return v_result;
end $$;
create function public.save_preparation_profile(p_business_id uuid,p_operation_id uuid,p_expected_revision integer,p_values jsonb)
returns jsonb language sql security invoker set search_path = ''
as $$ select app_private.save_preparation_profile(p_business_id,p_operation_id,p_expected_revision,p_values); $$;
revoke all on function app_private.save_preparation_profile(uuid,uuid,integer,jsonb) from public,anon,authenticated;
revoke all on function public.save_preparation_profile(uuid,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function app_private.save_preparation_profile(uuid,uuid,integer,jsonb) to authenticated;
grant execute on function public.save_preparation_profile(uuid,uuid,integer,jsonb) to authenticated;
