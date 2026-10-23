-- Manual entry is an immutable, owner-reviewed create command. Corrections and
-- settlement links are deliberately not exposed by this initial feature.
create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;
grant usage on schema app_private to authenticated;

create table public.businesses (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete restrict,
  name text not null check (char_length(name) between 1 and 100 and name = btrim(name)),
  currency text not null default 'PHP' check (currency = 'PHP'),
  timezone text not null default 'Asia/Manila' check (timezone = 'Asia/Manila'),
  created_at timestamptz not null default now()
);
create index businesses_owner_id_idx on public.businesses(owner_id);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  kind text not null check (kind in (
    'sale', 'expense', 'owner_contribution', 'owner_withdrawal',
    'loan_received', 'loan_repayment', 'transfer_in', 'transfer_out'
  )),
  business_date date not null check (business_date between date '1900-01-01' and date '2100-12-31'),
  amount_centavos bigint not null check (amount_centavos between 0 and 999999999999),
  currency text not null default 'PHP' check (currency = 'PHP'),
  description text check (description is null or (
    char_length(description) between 1 and 500 and description = btrim(description)
  )),
  money_movement text not null check (money_movement in ('in', 'out', 'none', 'unknown')),
  source text not null default 'manual' check (source = 'manual'),
  review_status text not null default 'confirmed' check (review_status = 'confirmed'),
  revision integer not null default 1 check (revision = 1),
  recorded_by uuid not null references auth.users(id) on delete restrict,
  recorded_at timestamptz not null default now(),
  unique (business_id, id),
  constraint transaction_meaning_movement check (
    money_movement = 'unknown'
    or (kind = 'sale' and money_movement in ('in', 'none'))
    or (kind = 'expense' and money_movement in ('out', 'none'))
    or (kind in ('owner_contribution', 'loan_received', 'transfer_in') and money_movement = 'in')
    or (kind in ('owner_withdrawal', 'loan_repayment', 'transfer_out') and money_movement = 'out')
  )
);
create index transactions_business_date_idx on public.transactions(business_id, business_date desc, recorded_at desc, id);
create index transactions_recorded_by_idx on public.transactions(recorded_by);

create table app_private.transaction_revisions (
  business_id uuid not null,
  transaction_id uuid not null,
  revision integer not null check (revision > 0),
  previous_revision integer not null check (previous_revision = revision - 1),
  actor_id uuid not null references auth.users(id) on delete restrict,
  recorded_at timestamptz not null default now(),
  source text not null check (source = 'manual'),
  interpretation jsonb not null check (jsonb_typeof(interpretation) = 'object'),
  primary key (business_id, transaction_id, revision),
  foreign key (business_id, transaction_id) references public.transactions(business_id, id) on delete restrict
);
create index transaction_revisions_actor_idx on app_private.transaction_revisions(actor_id);

create table app_private.transaction_mutations (
  business_id uuid not null references public.businesses(id) on delete restrict,
  operation_id uuid not null,
  actor_id uuid not null references auth.users(id) on delete restrict,
  command_kind text not null check (command_kind = 'create_manual_transaction'),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  transaction_id uuid not null,
  accepted_revision integer not null check (accepted_revision > 0),
  accepted_at timestamptz not null default now(),
  primary key (business_id, operation_id),
  foreign key (business_id, transaction_id) references public.transactions(business_id, id) on delete restrict
);
create index transaction_mutations_actor_idx on app_private.transaction_mutations(actor_id);
create index transaction_mutations_record_idx on app_private.transaction_mutations(business_id, transaction_id);

alter table public.businesses enable row level security;
alter table public.transactions enable row level security;
alter table app_private.transaction_revisions enable row level security;
alter table app_private.transaction_mutations enable row level security;

create policy businesses_read_own on public.businesses for select to authenticated
  using (owner_id = (select auth.uid()));
create policy transactions_read_own on public.transactions for select to authenticated
  using (business_id in (select id from public.businesses where owner_id = (select auth.uid())));

-- Read grants and RLS are separate. No direct table INSERT/UPDATE/DELETE exists
-- for clients: acceptance must also create its revision and replay receipt.
revoke all on public.businesses, public.transactions from public, anon, authenticated;
revoke all on app_private.transaction_revisions, app_private.transaction_mutations from public, anon, authenticated;
grant select on public.businesses, public.transactions to authenticated;

create function app_private.create_business(p_business_id uuid, p_name text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_existing public.businesses%rowtype;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'UNAUTHENTICATED';
  end if;
  if p_business_id is null or p_name is null or char_length(p_name) not between 1 and 100
    or p_name <> btrim(p_name) then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('business:' || p_business_id::text, 0));
  select * into v_existing from public.businesses where id = p_business_id;
  if found then
    if v_existing.owner_id <> v_actor then
      raise exception using errcode = '42501', message = 'FORBIDDEN';
    end if;
    if v_existing.name <> p_name then
      raise exception using errcode = 'P0001', message = 'OPERATION_CONFLICT';
    end if;
    return jsonb_build_object('id', v_existing.id, 'name', v_existing.name);
  end if;
  insert into public.businesses(id, owner_id, name) values (p_business_id, v_actor, p_name);
  return jsonb_build_object('id', p_business_id, 'name', p_name);
end;
$$;

create function app_private.accept_manual_transaction(p_business_id uuid, p_operation_id uuid, p_payload jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_business public.businesses%rowtype;
  v_existing app_private.transaction_mutations%rowtype;
  v_id uuid;
  v_date date;
  v_amount bigint;
  v_kind text;
  v_movement text;
  v_description text;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'UNAUTHENTICATED';
  end if;
  -- A row lock keeps authorization stable throughout this acceptance transaction.
  select * into v_business from public.businesses
    where id = p_business_id and owner_id = v_actor for share;
  if not found then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  if p_operation_id is null or p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;
  if not (p_payload ?& array['version','businessDate','kind','amountCentavos','description','moneyMovement','reviewConfirmed','expectedRevision'])
    or (select count(*) from jsonb_object_keys(p_payload)) <> 8
    or p_payload->'version' <> '1'::jsonb
    or p_payload->'reviewConfirmed' <> 'true'::jsonb
    or p_payload->'expectedRevision' <> '0'::jsonb
    or jsonb_typeof(p_payload->'businessDate') <> 'string'
    or jsonb_typeof(p_payload->'kind') <> 'string'
    or jsonb_typeof(p_payload->'amountCentavos') <> 'string'
    or jsonb_typeof(p_payload->'moneyMovement') <> 'string'
    or jsonb_typeof(p_payload->'description') not in ('string','null') then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;
  if (p_payload->>'amountCentavos') !~ '^(0|[1-9][0-9]{0,11})$'
    or (p_payload->>'businessDate') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;
  begin
    v_date := (p_payload->>'businessDate')::date;
    v_amount := (p_payload->>'amountCentavos')::bigint;
  exception when invalid_datetime_format or datetime_field_overflow or invalid_text_representation or numeric_value_out_of_range then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end;
  v_kind := p_payload->>'kind';
  v_movement := p_payload->>'moneyMovement';
  v_description := p_payload->>'description';
  if v_date not between date '1900-01-01' and date '2100-12-31'
    or to_char(v_date, 'YYYY-MM-DD') <> (p_payload->>'businessDate')
    or v_amount not between 0 and 999999999999
    or v_kind not in ('sale','expense','owner_contribution','owner_withdrawal','loan_received','loan_repayment','transfer_in','transfer_out')
    or v_movement not in ('in','out','none','unknown')
    or (v_description is not null and (char_length(v_description) not between 1 and 500 or v_description <> btrim(v_description)))
    or not (
      v_movement = 'unknown'
      or (v_kind = 'sale' and v_movement in ('in','none'))
      or (v_kind = 'expense' and v_movement in ('out','none'))
      or (v_kind in ('owner_contribution','loan_received','transfer_in') and v_movement = 'in')
      or (v_kind in ('owner_withdrawal','loan_repayment','transfer_out') and v_movement = 'out')
    ) then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;
  -- Serialize duplicate commands; hash collisions only serialize unrelated work.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_business_id::text || ':' || p_operation_id::text, 0));
  select * into v_existing from app_private.transaction_mutations
    where business_id = p_business_id and operation_id = p_operation_id;
  if found then
    if v_existing.actor_id <> v_actor or v_existing.payload <> p_payload then
      raise exception using errcode = 'P0001', message = 'OPERATION_CONFLICT';
    end if;
    return jsonb_build_object('id', v_existing.transaction_id, 'revision', v_existing.accepted_revision);
  end if;
  -- All three writes are part of the one RPC transaction. Any error rolls back all.
  insert into public.transactions(business_id,kind,business_date,amount_centavos,description,money_movement,recorded_by)
    values (p_business_id,v_kind,v_date,v_amount,v_description,v_movement,v_actor) returning id into v_id;
  insert into app_private.transaction_revisions(business_id,transaction_id,revision,previous_revision,actor_id,source,interpretation)
    values (p_business_id,v_id,1,0,v_actor,'manual',p_payload);
  insert into app_private.transaction_mutations(business_id,operation_id,actor_id,command_kind,payload,transaction_id,accepted_revision)
    values (p_business_id,p_operation_id,v_actor,'create_manual_transaction',p_payload,v_id,1);
  return jsonb_build_object('id', v_id, 'revision', 1);
end;
$$;

-- Public API wrappers retain invoker permissions. Privilege elevation exists only
-- in the private, narrowly scoped functions above, which always check auth.uid().
-- This is required to prevent callers bypassing atomic audit/idempotency writes.
create function public.create_business(p_business_id uuid, p_name text)
returns jsonb language sql security invoker set search_path = ''
as $$ select app_private.create_business(p_business_id, p_name); $$;

create function public.accept_manual_transaction(p_business_id uuid, p_operation_id uuid, p_payload jsonb)
returns jsonb language sql security invoker set search_path = ''
as $$ select app_private.accept_manual_transaction(p_business_id, p_operation_id, p_payload); $$;

revoke all on function app_private.create_business(uuid,text) from public, anon, authenticated;
revoke all on function app_private.accept_manual_transaction(uuid,uuid,jsonb) from public, anon, authenticated;
revoke all on function public.create_business(uuid,text) from public, anon, authenticated;
revoke all on function public.accept_manual_transaction(uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function app_private.create_business(uuid,text) to authenticated;
grant execute on function app_private.accept_manual_transaction(uuid,uuid,jsonb) to authenticated;
grant execute on function public.create_business(uuid,text) to authenticated;
grant execute on function public.accept_manual_transaction(uuid,uuid,jsonb) to authenticated;

comment on table public.transactions is 'Owner-reviewed manual records. These are not filing, payment, tax, or registered-books evidence.';
comment on function app_private.accept_manual_transaction(uuid,uuid,jsonb) is 'Controlled atomic acceptance; private SECURITY DEFINER is intentional, with explicit current actor/business ownership and payload validation.';
