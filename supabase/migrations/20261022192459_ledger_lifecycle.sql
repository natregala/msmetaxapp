-- Additive financial lifecycle. Original v1 commands/receipts remain compatible.
alter table public.businesses add column ledger_version bigint not null default 0 check (ledger_version >= 0);
alter table public.transactions drop constraint transactions_revision_check;
alter table public.transactions add constraint transactions_revision_check check (revision > 0);
alter table public.transactions drop constraint transactions_source_check;
alter table public.transactions add constraint transactions_source_check check (source in ('manual','document_review'));
alter table app_private.transaction_revisions drop constraint transaction_revisions_source_check;
alter table app_private.transaction_revisions add constraint transaction_revisions_source_check check (source in ('manual','document_review'));
alter table public.transactions
  add column status text not null default 'active' check (status in ('active','void')),
  add column payment_knowledge text not null default 'unknown' check (payment_knowledge in ('known','unknown'));

create table public.transaction_payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  transaction_id uuid not null,
  amount_centavos bigint not null check (amount_centavos between 1 and 999999999999),
  payment_date date check (payment_date between date '1900-01-01' and date '2100-12-31'),
  status text not null default 'active' check (status in ('active','void')),
  revision integer not null default 1 check (revision > 0),
  recorded_by uuid not null references auth.users(id),
  recorded_at timestamptz not null default now(),
  foreign key (business_id,transaction_id) references public.transactions(business_id,id),
  unique (business_id,id)
);
create index transaction_payments_record_idx on public.transaction_payments(business_id,transaction_id,payment_date);
create index transaction_payments_period_idx on public.transaction_payments(business_id,payment_date,status);
create table app_private.payment_revisions (
  business_id uuid not null, payment_id uuid not null, revision integer not null,
  previous_revision integer not null, actor_id uuid not null references auth.users(id),
  recorded_at timestamptz not null default now(), interpretation jsonb not null,
  primary key (business_id,payment_id,revision),
  foreign key (business_id,payment_id) references public.transaction_payments(business_id,id),
  check (revision > 0 and previous_revision = revision - 1)
);
create table app_private.ledger_operations (
  business_id uuid not null references public.businesses(id), operation_id uuid not null,
  actor_id uuid not null references auth.users(id), command jsonb not null, result jsonb not null,
  recorded_at timestamptz not null default now(), primary key (business_id,operation_id)
);
create table public.transaction_sources (
  business_id uuid not null, transaction_id uuid not null, document_id uuid not null,
  row_id uuid not null, source_type text not null,
  primary key (business_id,transaction_id),
  foreign key (business_id,transaction_id) references public.transactions(business_id,id)
);
create table public.ledger_snapshots (
  id uuid primary key, business_id uuid not null references public.businesses(id),
  actor_id uuid not null references auth.users(id), command jsonb not null,
  ledger_version bigint not null, snapshot jsonb not null,
  created_at timestamptz not null default now()
);
create index ledger_snapshots_business_idx on public.ledger_snapshots(business_id,created_at desc);
alter table public.transaction_payments enable row level security;
alter table public.transaction_sources enable row level security;
alter table public.ledger_snapshots enable row level security;
alter table app_private.payment_revisions enable row level security;
alter table app_private.ledger_operations enable row level security;
create policy payments_read_own on public.transaction_payments for select to authenticated using (
  business_id in (select id from public.businesses where owner_id = (select auth.uid())));
create policy sources_read_own on public.transaction_sources for select to authenticated using (
  business_id in (select id from public.businesses where owner_id = (select auth.uid())));
create policy snapshots_read_own on public.ledger_snapshots for select to authenticated using (
  business_id in (select id from public.businesses where owner_id = (select auth.uid())));
revoke all on public.transaction_payments,public.transaction_sources,public.ledger_snapshots,
  app_private.payment_revisions,app_private.ledger_operations from public,anon,authenticated;
grant select on public.transaction_payments,public.transaction_sources,public.ledger_snapshots to authenticated;

-- Legacy known movement amounts remain known. Their separately unrecorded
-- payment dates remain NULL; the business date is not invented as a payment date.
update public.transactions set payment_knowledge = case when money_movement='unknown' then 'unknown' else 'known' end;
insert into public.transaction_payments(business_id,transaction_id,amount_centavos,payment_date,recorded_by,recorded_at)
select business_id,id,amount_centavos,null,recorded_by,recorded_at
from public.transactions where money_movement in ('in','out') and amount_centavos>0;
insert into app_private.payment_revisions(business_id,payment_id,revision,previous_revision,actor_id,recorded_at,interpretation)
select business_id,id,1,0,recorded_by,recorded_at,
  jsonb_build_object('action','legacy_movement','amountCentavos',amount_centavos::text,'paymentDate',null,'provenance','legacy_date_unknown')
from public.transaction_payments;

create function app_private.ledger_owner(p_business_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid();
begin
  if v_actor is null then raise exception using errcode='42501',message='UNAUTHENTICATED'; end if;
  perform 1 from public.businesses where id=p_business_id and owner_id=v_actor;
  if not found then raise exception using errcode='42501',message='FORBIDDEN'; end if;
  return v_actor;
end $$;
create function app_private.ledger_keys(p_value jsonb,p_keys text[]) returns void
language plpgsql set search_path='' as $$
begin
  if p_value is null or jsonb_typeof(p_value)<>'object'
    or not (p_value ?& p_keys)
    or (select count(*) from jsonb_object_keys(p_value))<>cardinality(p_keys) then
    raise exception using errcode='22023',message='VALIDATION_FAILED';
  end if;
end $$;
create function app_private.ledger_amount(p_value jsonb) returns bigint
language plpgsql immutable set search_path='' as $$
declare v_amount bigint;
begin
  if p_value is null or jsonb_typeof(p_value)<>'string' or (p_value#>>'{}') !~ '^(0|[1-9][0-9]{0,11})$' then
    raise exception using errcode='22023',message='VALIDATION_FAILED';
  end if;
  v_amount:=(p_value#>>'{}')::bigint;
  if v_amount>999999999999 then raise exception using errcode='22023',message='VALIDATION_FAILED'; end if;
  return v_amount;
end $$;
create function app_private.ledger_date(p_value jsonb) returns date
language plpgsql immutable set search_path='' as $$
declare v_date date;
begin
  if p_value is null or jsonb_typeof(p_value)<>'string' or (p_value#>>'{}') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    raise exception using errcode='22023',message='VALIDATION_FAILED';
  end if;
  begin v_date:=(p_value#>>'{}')::date;
  exception when invalid_datetime_format or datetime_field_overflow then raise exception using errcode='22023',message='VALIDATION_FAILED'; end;
  if v_date not between date '1900-01-01' and date '2100-12-31' or to_char(v_date,'YYYY-MM-DD')<>(p_value#>>'{}') then
    raise exception using errcode='22023',message='VALIDATION_FAILED';
  end if;
  return v_date;
end $$;
create function app_private.ledger_text(p_value jsonb,p_nullable boolean default false) returns text
language plpgsql immutable set search_path='' as $$
declare v_text text:=p_value#>>'{}';
begin
  if p_nullable and p_value='null'::jsonb then return null; end if;
  if p_value is null or jsonb_typeof(p_value)<>'string' or char_length(v_text) not between 1 and 500 or v_text<>btrim(v_text) then
    raise exception using errcode='22023',message='VALIDATION_FAILED';
  end if;
  return v_text;
end $$;

create function app_private.ledger_bump() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  update public.businesses set ledger_version=ledger_version+1 where id=new.business_id;
  return new;
end $$;
create trigger ledger_transaction_changed after insert or update on public.transactions for each row execute function app_private.ledger_bump();
create trigger ledger_payment_changed after insert or update on public.transaction_payments for each row execute function app_private.ledger_bump();
create trigger ledger_source_changed after insert or update on public.transaction_sources for each row execute function app_private.ledger_bump();
create function app_private.ledger_seed_payment() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_payment uuid;
begin
  update public.transactions set payment_knowledge=case when new.money_movement='unknown' then 'unknown' else 'known' end where id=new.id;
  if new.money_movement in ('in','out') and new.amount_centavos>0 then
    insert into public.transaction_payments(business_id,transaction_id,amount_centavos,payment_date,recorded_by)
      values(new.business_id,new.id,new.amount_centavos,null,new.recorded_by) returning id into v_payment;
    insert into app_private.payment_revisions(business_id,payment_id,revision,previous_revision,actor_id,interpretation)
      values(new.business_id,v_payment,1,0,new.recorded_by,jsonb_build_object('action','legacy_movement','amountCentavos',new.amount_centavos::text,'paymentDate',null,'provenance','legacy_date_unknown'));
  end if;
  return new;
end $$;
create trigger ledger_seed_legacy_payment after insert on public.transactions for each row execute function app_private.ledger_seed_payment();

create function app_private.ledger_mutate(p_business_id uuid,p_operation_id uuid,p_action text,p_record_id uuid,p_expected_revision integer,p_values jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid:=app_private.ledger_owner(p_business_id);
  v_command jsonb:=jsonb_build_object('action',p_action,'recordId',p_record_id,'expectedRevision',p_expected_revision,'values',p_values);
  v_receipt app_private.ledger_operations%rowtype; v_record public.transactions%rowtype;
  v_payment public.transaction_payments%rowtype; v_result jsonb; v_id uuid;
  v_amount bigint; v_paid bigint; v_total bigint; v_date date; v_description text; v_kind text; v_status text;
begin
  if p_operation_id is null or p_values is null or jsonb_typeof(p_values)<>'object' or p_action is null then
    raise exception using errcode='22023',message='VALIDATION_FAILED';
  end if;
  perform 1 from public.businesses where id=p_business_id and owner_id=v_actor for update;
  if not found then raise exception using errcode='42501',message='FORBIDDEN'; end if;
  -- Same business lock order as legacy acceptance, shared by all new operations.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_business_id::text||':'||p_operation_id::text,0));
  select * into v_receipt from app_private.ledger_operations where business_id=p_business_id and operation_id=p_operation_id;
  if found then
    if v_receipt.actor_id<>v_actor or v_receipt.command<>v_command then raise exception using errcode='P0001',message='OPERATION_CONFLICT'; end if;
    return v_receipt.result;
  end if;
  if exists(select 1 from public.ledger_snapshots where id=p_operation_id)
    or exists(select 1 from app_private.transaction_mutations where business_id=p_business_id and operation_id=p_operation_id) then
    raise exception using errcode='P0001',message='OPERATION_CONFLICT';
  end if;
  if p_action='create' then
    perform app_private.ledger_keys(p_values,array['businessDate','kind','amountCentavos','description','paymentStatus','paymentAmountCentavos','paymentDate']);
    if p_record_id is not null or p_expected_revision is distinct from 0 then raise exception using errcode='22023',message='VALIDATION_FAILED'; end if;
    v_amount:=app_private.ledger_amount(p_values->'amountCentavos');
    v_date:=app_private.ledger_date(p_values->'businessDate');
    v_description:=app_private.ledger_text(p_values->'description',true);
    v_kind:=p_values->>'kind'; v_status:=p_values->>'paymentStatus';
    if v_kind is null or v_kind not in ('sale','expense','owner_contribution','owner_withdrawal')
      or v_status is null or v_status not in ('paid','unpaid','partial','unknown')
      or (v_kind not in ('sale','expense') and v_status not in ('paid','unknown')) then
      raise exception using errcode='22023',message='VALIDATION_FAILED';
    end if;
    if v_status in ('paid','partial') then
      v_paid:=app_private.ledger_amount(p_values->'paymentAmountCentavos');
      if app_private.ledger_date(p_values->'paymentDate')<v_date then
        raise exception using errcode='22023',message='PAYMENT_BEFORE_RECORD';
      end if;
      if (v_status='paid' and v_paid<>v_amount) or (v_status='partial' and (v_paid<=0 or v_paid>=v_amount)) then
        raise exception using errcode='22023',message='INVALID_PAYMENT';
      end if;
    else
      if p_values->'paymentAmountCentavos'<>'null'::jsonb or p_values->'paymentDate'<>'null'::jsonb then
        raise exception using errcode='22023',message='VALIDATION_FAILED';
      end if;
      v_paid:=0;
    end if;
    -- The v1 creator still owns the original immutable acceptance receipt.
    v_result:=app_private.accept_manual_transaction(p_business_id,p_operation_id,jsonb_build_object(
      'version',1,'businessDate',v_date,'kind',v_kind,'amountCentavos',v_amount::text,'description',v_description,
      'moneyMovement','unknown','reviewConfirmed',true,'expectedRevision',0));
    v_id:=(v_result->>'id')::uuid;
    update public.transactions set payment_knowledge=case when v_status='unknown' then 'unknown' else 'known' end,
      money_movement=case when v_status='unknown' then 'unknown' when v_status='paid' or v_paid>0 or v_kind in ('owner_contribution','owner_withdrawal')
        then case when v_kind in ('sale','owner_contribution') then 'in' else 'out' end else 'none' end
      where id=v_id;
    if v_paid>0 then
      insert into public.transaction_payments(business_id,transaction_id,amount_centavos,payment_date,recorded_by)
        values(p_business_id,v_id,v_paid,app_private.ledger_date(p_values->'paymentDate'),v_actor) returning id into v_id;
      insert into app_private.payment_revisions(business_id,payment_id,revision,previous_revision,actor_id,interpretation)
        values(p_business_id,v_id,1,0,v_actor,jsonb_build_object('action','initial_payment','amountCentavos',v_paid::text,'paymentDate',p_values->'paymentDate'));
    end if;
    -- Initial interpretation includes the explicit payment meaning, not merely its v1 bridge.
    update app_private.transaction_revisions set interpretation=jsonb_build_object('action','create','values',p_values)
      where business_id=p_business_id and transaction_id=(v_result->>'id')::uuid and revision=1;
  else
    if p_record_id is null or p_expected_revision is null or p_expected_revision<1 then raise exception using errcode='22023',message='VALIDATION_FAILED'; end if;
    select * into v_record from public.transactions where business_id=p_business_id and id=p_record_id for update;
    if not found then raise exception using errcode='42501',message='FORBIDDEN'; end if;
    if v_record.revision<>p_expected_revision then raise exception using errcode='P0001',message='REVISION_CONFLICT'; end if;
    if v_record.status='void' then raise exception using errcode='P0001',message='RECORD_VOID'; end if;
    select coalesce(sum(amount_centavos),0)::bigint into v_total from public.transaction_payments
      where business_id=p_business_id and transaction_id=p_record_id and status='active';
    if p_action='correct' then
      perform app_private.ledger_keys(p_values,array['kind','businessDate','amountCentavos','description','reason']);
      perform app_private.ledger_text(p_values->'reason');
      v_amount:=app_private.ledger_amount(p_values->'amountCentavos'); v_date:=app_private.ledger_date(p_values->'businessDate');
      v_description:=app_private.ledger_text(p_values->'description',true); v_kind:=p_values->>'kind';
      if v_kind is null or v_kind not in ('sale','expense','owner_contribution','owner_withdrawal','loan_received','loan_repayment','transfer_in','transfer_out') then
        raise exception using errcode='22023',message='VALIDATION_FAILED';
      end if;
      if v_total>v_amount or (v_kind<>v_record.kind and exists(select 1 from public.transaction_payments where business_id=p_business_id and transaction_id=p_record_id and status='active'))
        then raise exception using errcode='P0001',message='LINKED_PAYMENT_CONFLICT'; end if;
      if exists(select 1 from public.transaction_payments where business_id=p_business_id and transaction_id=p_record_id and status='active' and payment_date<v_date)
        then raise exception using errcode='22023',message='PAYMENT_BEFORE_RECORD'; end if;
      update public.transactions set amount_centavos=v_amount,business_date=v_date,kind=v_kind,description=v_description where id=p_record_id;
    elsif p_action='void' then
      perform app_private.ledger_keys(p_values,array['reason']); perform app_private.ledger_text(p_values->'reason');
      if exists(select 1 from public.transaction_payments where business_id=p_business_id and transaction_id=p_record_id and status='active')
        then raise exception using errcode='P0001',message='LINKED_PAYMENT_CONFLICT'; end if;
      update public.transactions set status='void' where id=p_record_id;
    elsif p_action='resolve_payment' then
      perform app_private.ledger_keys(p_values,array['paymentKnowledge','reason']); perform app_private.ledger_text(p_values->'reason');
      if (p_values->>'paymentKnowledge') is null or (p_values->>'paymentKnowledge') not in ('known','unknown') then
        raise exception using errcode='22023',message='VALIDATION_FAILED'; end if;
      if p_values->>'paymentKnowledge'='unknown' and v_total>0 then raise exception using errcode='P0001',message='LINKED_PAYMENT_CONFLICT'; end if;
      update public.transactions set payment_knowledge=p_values->>'paymentKnowledge' where id=p_record_id;
    elsif p_action in ('add_payment','correct_payment','void_payment') then
      if p_action='add_payment' and v_record.kind not in ('sale','expense') then raise exception using errcode='22023',message='UNSUPPORTED_SETTLEMENT'; end if;
      if v_record.payment_knowledge='unknown' then raise exception using errcode='P0001',message='CLARIFICATION_REQUIRED'; end if;
      if p_action='add_payment' then
        perform app_private.ledger_keys(p_values,array['amountCentavos','paymentDate']);
      elsif p_action='correct_payment' then
        perform app_private.ledger_keys(p_values,array['paymentId','expectedPaymentRevision','amountCentavos','paymentDate','reason']);
        perform app_private.ledger_text(p_values->'reason');
      else
        perform app_private.ledger_keys(p_values,array['paymentId','expectedPaymentRevision','reason']); perform app_private.ledger_text(p_values->'reason');
      end if;
      if p_action<>'add_payment' then
        if jsonb_typeof(p_values->'expectedPaymentRevision')<>'number' or (p_values->>'expectedPaymentRevision')!~'^[1-9][0-9]{0,9}$' then
          raise exception using errcode='22023',message='VALIDATION_FAILED'; end if;
        begin select * into v_payment from public.transaction_payments where business_id=p_business_id and transaction_id=p_record_id and id=(p_values->>'paymentId')::uuid for update;
        exception when invalid_text_representation then raise exception using errcode='22023',message='VALIDATION_FAILED'; end;
        if not found then raise exception using errcode='42501',message='FORBIDDEN'; end if;
        if v_payment.revision::text<>p_values->>'expectedPaymentRevision' or v_payment.status='void' then
          raise exception using errcode='P0001',message='REVISION_CONFLICT'; end if;
        v_total:=v_total-v_payment.amount_centavos;
      end if;
      if p_action='void_payment' then
        update public.transaction_payments set status='void',revision=revision+1 where id=v_payment.id;
        v_id:=v_payment.id;
      else
        v_amount:=app_private.ledger_amount(p_values->'amountCentavos'); v_date:=app_private.ledger_date(p_values->'paymentDate');
        if v_amount<=0 or v_total+v_amount>v_record.amount_centavos then raise exception using errcode='22023',message='INVALID_PAYMENT'; end if;
        if v_date<v_record.business_date then raise exception using errcode='22023',message='PAYMENT_BEFORE_RECORD'; end if;
        if p_action='add_payment' then
          insert into public.transaction_payments(business_id,transaction_id,amount_centavos,payment_date,recorded_by)
            values(p_business_id,p_record_id,v_amount,v_date,v_actor) returning id into v_id;
        else
          v_id:=v_payment.id;
          update public.transaction_payments set amount_centavos=v_amount,payment_date=v_date,revision=revision+1 where id=v_id;
        end if;
      end if;
      insert into app_private.payment_revisions(business_id,payment_id,revision,previous_revision,actor_id,interpretation)
        select p_business_id,id,revision,revision-1,v_actor,jsonb_build_object('action',p_action,'values',p_values)
          from public.transaction_payments where id=v_id;
    else raise exception using errcode='22023',message='VALIDATION_FAILED';
    end if;
    select coalesce(sum(amount_centavos),0)::bigint into v_total from public.transaction_payments
      where business_id=p_business_id and transaction_id=p_record_id and status='active';
    update public.transactions set revision=revision+1,
      money_movement=case when payment_knowledge='unknown' then 'unknown'
        when v_total>0 or kind not in ('sale','expense') then
          case when kind in ('sale','owner_contribution','loan_received','transfer_in') then 'in' else 'out' end
        else 'none' end
      where id=p_record_id returning * into v_record;
    insert into app_private.transaction_revisions(business_id,transaction_id,revision,previous_revision,actor_id,source,interpretation)
      values(p_business_id,p_record_id,v_record.revision,v_record.revision-1,v_actor,v_record.source,
        jsonb_build_object('action',p_action,'values',p_values,'record',to_jsonb(v_record),'knownPaidCentavos',v_total::text));
    v_result:=jsonb_build_object('id',p_record_id,'revision',v_record.revision);
  end if;
  insert into app_private.ledger_operations(business_id,operation_id,actor_id,command,result)
    values(p_business_id,p_operation_id,v_actor,v_command,v_result);
  return v_result;
end $$;

create function app_private.ledger_record_json(p_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('id',t.id,'businessId',t.business_id,'kind',t.kind,'businessDate',t.business_date,
    'amountCentavos',t.amount_centavos::text,'description',t.description,'moneyMovement',t.money_movement,
    'revision',t.revision,'status',t.status,'paymentKnowledge',t.payment_knowledge,'paidCentavos',p.paid::text,
    'remainingCentavos',case when t.payment_knowledge='unknown' then null else (t.amount_centavos-p.paid)::text end,
    'paymentStatus',case when t.payment_knowledge='unknown' then 'unknown' when t.amount_centavos=0 and t.money_movement='none' then 'unpaid' when p.paid=t.amount_centavos then 'paid' when p.paid>0 then 'partial' else 'unpaid' end,
    'recordedAt',t.recorded_at,'source',t.source,'sourceReference',
      (select jsonb_build_object('documentId',s.document_id,'rowId',s.row_id,'sourceType',s.source_type)
       from public.transaction_sources s where s.business_id=t.business_id and s.transaction_id=t.id))
  from public.transactions t cross join lateral
    (select coalesce(sum(amount_centavos),0)::bigint paid from public.transaction_payments where transaction_id=t.id and status='active') p where t.id=p_id;
$$;
create function app_private.ledger_payment_json(p public.transaction_payments) returns jsonb
language sql immutable set search_path='' as $$
  select jsonb_build_object('id',p.id,'transactionId',p.transaction_id,'amountCentavos',p.amount_centavos::text,
    'paymentDate',p.payment_date,'status',p.status,'revision',p.revision,'recordedAt',p.recorded_at);
$$;
create function app_private.ledger_list(p_business_id uuid,p_filters jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_records jsonb; v_count integer; v_page integer:=coalesce((p_filters->>'page')::integer,1);
begin
  perform app_private.ledger_owner(p_business_id);
  if p_filters is null or jsonb_typeof(p_filters)<>'object' or v_page not between 1 and 100000 then raise exception using errcode='22023',message='VALIDATION_FAILED'; end if;
  if p_filters?'from' then perform app_private.ledger_date(p_filters->'from'); end if;
  if p_filters?'to' then perform app_private.ledger_date(p_filters->'to'); end if;
  if (p_filters->>'from')>(p_filters->>'to') then raise exception using errcode='22023',message='VALIDATION_FAILED'; end if;
  with matches as (
    select t.*,app_private.ledger_record_json(t.id) as record from public.transactions t where t.business_id=p_business_id
      and (not p_filters?'from' or t.business_date>=(p_filters->>'from')::date)
      and (not p_filters?'to' or t.business_date<=(p_filters->>'to')::date)
      and (not p_filters?'kind' or t.kind=p_filters->>'kind')
      and (not p_filters?'status' or t.status=p_filters->>'status')
      and (not p_filters?'search' or position(lower(p_filters->>'search') in lower(coalesce(t.description,'')))>0)
  ), filtered as (select * from matches where not p_filters?'payment' or record->>'paymentStatus'=p_filters->>'payment'
      or (p_filters->>'payment'='needs_attention' and (payment_knowledge='unknown'
        or exists(select 1 from public.transaction_payments p where p.transaction_id=matches.id and p.status='active' and p.payment_date is null))))
  select (select count(*)::integer from filtered),
    coalesce((select jsonb_agg(record order by business_date desc,recorded_at desc,id) from
      (select * from filtered order by business_date desc,recorded_at desc,id limit 25 offset ((v_page-1)*25)) page),'[]'::jsonb)
    into v_count,v_records;
  return jsonb_build_object('records',v_records,'total',v_count,'page',v_page,'pageSize',25);
end $$;
create function app_private.ledger_detail(p_business_id uuid,p_record_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  perform app_private.ledger_owner(p_business_id);
  if not exists(select 1 from public.transactions where business_id=p_business_id and id=p_record_id) then
    raise exception using errcode='42501',message='FORBIDDEN'; end if;
  return jsonb_build_object('record',app_private.ledger_record_json(p_record_id),
    'payments',coalesce((select jsonb_agg(app_private.ledger_payment_json(p) order by p.payment_date,p.recorded_at) from public.transaction_payments p where p.business_id=p_business_id and p.transaction_id=p_record_id),'[]'::jsonb),
    'history',coalesce((select jsonb_agg(jsonb_build_object('revision',revision,'previousRevision',previous_revision,'actorId',actor_id,'recordedAt',recorded_at,'interpretation',interpretation) order by revision)
      from app_private.transaction_revisions where business_id=p_business_id and transaction_id=p_record_id),'[]'::jsonb),
    'paymentHistory',coalesce((select jsonb_agg(jsonb_build_object('paymentId',r.payment_id,'revision',r.revision,'previousRevision',r.previous_revision,'actorId',r.actor_id,'recordedAt',r.recorded_at,'interpretation',r.interpretation) order by r.recorded_at,r.revision)
      from app_private.payment_revisions r join public.transaction_payments p on p.id=r.payment_id where p.business_id=p_business_id and p.transaction_id=p_record_id),'[]'::jsonb));
end $$;

create function app_private.ledger_summary(p_business_id uuid,p_from date,p_to date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_totals jsonb; v_records jsonb; v_payments jsonb; v_count integer;
begin
  perform app_private.ledger_owner(p_business_id);
  if p_from is null or p_to is null or p_from>p_to or p_from<date '1900-01-01' or p_to>date '2100-12-31' then
    raise exception using errcode='22023',message='VALIDATION_FAILED'; end if;
  select count(*) into v_count from public.transactions t where t.business_id=p_business_id and
    (t.business_date between p_from and p_to or exists(select 1 from public.transaction_payments p where p.transaction_id=t.id and p.payment_date between p_from and p_to));
  if v_count>10000 then raise exception using errcode='22023',message='PERIOD_TOO_LARGE'; end if;
  with period as (
    select t.*,coalesce((select sum(p.amount_centavos) from public.transaction_payments p where p.transaction_id=t.id and p.status='active' and p.payment_date<=p_to),0)::bigint settled,
      exists(select 1 from public.transaction_payments p where p.transaction_id=t.id and p.status='active' and p.payment_date is null) undated
    from public.transactions t where t.business_id=p_business_id and t.business_date between p_from and p_to
  ), cash as (
    select coalesce(sum(p.amount_centavos) filter(where t.kind in ('sale','owner_contribution','loan_received','transfer_in')),0)::text received,
      coalesce(sum(p.amount_centavos) filter(where t.kind in ('expense','owner_withdrawal','loan_repayment','transfer_out')),0)::text paid
    from public.transaction_payments p join public.transactions t on t.id=p.transaction_id
    where p.business_id=p_business_id and p.status='active' and t.status='active' and p.payment_date between p_from and p_to
  )
  select jsonb_build_object(
    'salesCentavos',coalesce(sum(amount_centavos) filter(where kind='sale' and status='active'),0)::text,
    'expensesCentavos',coalesce(sum(amount_centavos) filter(where kind='expense' and status='active'),0)::text,
    'receivedCentavos',(select received from cash),'paidCentavos',(select paid from cash),
    'receivableCentavos',coalesce(sum(amount_centavos-settled) filter(where kind='sale' and status='active' and payment_knowledge='known' and not undated),0)::text,
    'payableCentavos',coalesce(sum(amount_centavos-settled) filter(where kind='expense' and status='active' and payment_knowledge='known' and not undated),0)::text,
    'unknownCount',count(*) filter(where (payment_knowledge='unknown' or undated) and status='active'),
    'undatedPaymentCount',(select count(*) from public.transaction_payments p join public.transactions t on t.id=p.transaction_id where p.business_id=p_business_id and p.status='active' and t.status='active' and p.payment_date is null),
    'recordCount',count(*) filter(where status='active'),'voidCount',count(*) filter(where status='void')
  ) into v_totals from period;
  select coalesce(jsonb_agg(app_private.ledger_record_json(t.id) order by t.business_date,t.recorded_at,t.id),'[]'::jsonb) into v_records
    from public.transactions t where t.business_id=p_business_id and
      (t.business_date between p_from and p_to or exists(select 1 from public.transaction_payments p where p.transaction_id=t.id and p.payment_date between p_from and p_to));
  select coalesce(jsonb_agg(app_private.ledger_payment_json(p) order by p.payment_date,p.recorded_at,p.id),'[]'::jsonb) into v_payments
    from public.transaction_payments p join public.transactions t on t.id=p.transaction_id
    where p.business_id=p_business_id and (p.payment_date between p_from and p_to
      or (p.payment_date is null and t.business_date between p_from and p_to));
  return jsonb_build_object('from',p_from,'to',p_to,'totals',v_totals,'records',v_records,'payments',v_payments,
    'coverage','Accepted records only. Sales and expenses use business-event dates; known money received/paid uses confirmed payment-event dates, including settlements of earlier records. Outstanding balances cover known-payment sales/expenses dated in this period, with payments through the period end. Unknown payment and records with undated payments are excluded from period balances. Legacy v1 known movement amounts remain known but separate payment dates are unknown until confirmed by the owner; undated movements are excluded from dated cash totals. Undated payment count covers this business across all periods because their date is unresolved. Voided records/payments are excluded from totals and retained for inspection. Record details show current known balances. No opening balances, local drafts, accounting profit, or tax calculation.');
end $$;
create function app_private.ledger_snapshot_stale(p_snapshot jsonb,p_business_id uuid,p_current_version bigint) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare v_revision integer;
begin
  if (p_snapshot->>'ledgerVersion')::bigint<>p_current_version then return true; end if;
  if p_snapshot->'preparation' is not null and p_snapshot->'preparation'<>'null'::jsonb then
    if to_regclass('public.preparation_profiles') is null then return true; end if;
    execute 'select revision from public.preparation_profiles where business_id=$1' into v_revision using p_business_id;
    return v_revision is distinct from (p_snapshot->'preparation'->>'profileRevision')::integer;
  end if;
  return false;
end $$;
create function app_private.ledger_snapshot(p_business_id uuid,p_operation_id uuid,p_from date,p_to date,p_preparation jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=app_private.ledger_owner(p_business_id); v_existing public.ledger_snapshots%rowtype;
  v_command jsonb:=jsonb_build_object('from',p_from,'to',p_to,'preparation',p_preparation);
  v_snapshot jsonb; v_version bigint; v_created timestamptz:=now(); v_profile_revision integer; v_profile jsonb;
begin
  if p_operation_id is null or p_from is null or p_to is null or p_from>p_to or (p_preparation is not null and (jsonb_typeof(p_preparation)<>'object' or octet_length(p_preparation::text)>12000)) then
    raise exception using errcode='22023',message='VALIDATION_FAILED'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_business_id::text||':'||p_operation_id::text,0));
  select * into v_existing from public.ledger_snapshots where id=p_operation_id;
  if found then
    if v_existing.business_id<>p_business_id or v_existing.actor_id<>v_actor or v_existing.command<>v_command then
      raise exception using errcode='P0001',message='OPERATION_CONFLICT'; end if;
    select ledger_version into v_version from public.businesses where id=p_business_id;
    return v_existing.snapshot||jsonb_build_object('stale',app_private.ledger_snapshot_stale(v_existing.snapshot,p_business_id,v_version));
  end if;
  if exists(select 1 from app_private.ledger_operations where business_id=p_business_id and operation_id=p_operation_id)
    or exists(select 1 from app_private.transaction_mutations where business_id=p_business_id and operation_id=p_operation_id) then
    raise exception using errcode='P0001',message='OPERATION_CONFLICT'; end if;
  if p_preparation is not null then
    perform app_private.ledger_keys(p_preparation,array['profileRevision','profile']);
    if to_regclass('public.preparation_profiles') is null or jsonb_typeof(p_preparation->'profileRevision')<>'number'
      or (p_preparation->>'profileRevision')!~'^[1-9][0-9]{0,9}$' then
      raise exception using errcode='22023',message='VALIDATION_FAILED'; end if;
    execute 'select revision,profile_data from public.preparation_profiles where business_id=$1 for share'
      into v_profile_revision,v_profile using p_business_id;
    if v_profile_revision is distinct from (p_preparation->>'profileRevision')::integer or v_profile is distinct from p_preparation->'profile' then
      raise exception using errcode='P0001',message='REVISION_CONFLICT'; end if;
    if (v_profile->>'year')::integer<>extract(year from p_from)::integer or extract(year from p_from)<>extract(year from p_to) then
      raise exception using errcode='22023',message='PROFILE_PERIOD_MISMATCH'; end if;
  end if;
  -- Lock business while taking the whole report statement snapshot. Ledger
  -- mutation triggers update this row in the same transaction.
  select ledger_version into v_version from public.businesses where id=p_business_id for share;
  v_snapshot:=app_private.ledger_summary(p_business_id,p_from,p_to);
  v_snapshot:=v_snapshot||jsonb_build_object('id',p_operation_id,'businessId',p_business_id,'createdAt',v_created,'ledgerVersion',v_version::text,'stale',false,'preparation',p_preparation,
    'manifest',(select coalesce(jsonb_agg(jsonb_build_object('recordId',value->>'id','revision',value->'revision')),'[]'::jsonb) from jsonb_array_elements(v_snapshot->'records')));
  insert into public.ledger_snapshots(id,business_id,actor_id,command,ledger_version,snapshot,created_at)
    values(p_operation_id,p_business_id,v_actor,v_command,v_version,v_snapshot,v_created);
  return v_snapshot;
end $$;
create function app_private.ledger_read_snapshot(p_business_id uuid,p_snapshot_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_snapshot public.ledger_snapshots%rowtype; v_version bigint;
begin
  perform app_private.ledger_owner(p_business_id);
  select * into v_snapshot from public.ledger_snapshots where business_id=p_business_id and id=p_snapshot_id;
  if not found then raise exception using errcode='42501',message='FORBIDDEN'; end if;
  select ledger_version into v_version from public.businesses where id=p_business_id;
  return v_snapshot.snapshot||jsonb_build_object('stale',app_private.ledger_snapshot_stale(v_snapshot.snapshot,p_business_id,v_version));
end $$;

create function public.ledger_mutate(p_business_id uuid,p_operation_id uuid,p_action text,p_record_id uuid,p_expected_revision integer,p_values jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select app_private.ledger_mutate(p_business_id,p_operation_id,p_action,p_record_id,p_expected_revision,p_values); $$;
create function public.ledger_list(p_business_id uuid,p_filters jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select app_private.ledger_list(p_business_id,p_filters); $$;
create function public.ledger_detail(p_business_id uuid,p_record_id uuid)
returns jsonb language sql security invoker set search_path='' as $$ select app_private.ledger_detail(p_business_id,p_record_id); $$;
create function public.ledger_summary(p_business_id uuid,p_from date,p_to date)
returns jsonb language sql security invoker set search_path='' as $$ select app_private.ledger_summary(p_business_id,p_from,p_to); $$;
create function public.ledger_snapshot(p_business_id uuid,p_operation_id uuid,p_from date,p_to date,p_preparation jsonb default null)
returns jsonb language sql security invoker set search_path='' as $$ select app_private.ledger_snapshot(p_business_id,p_operation_id,p_from,p_to,p_preparation); $$;
create function public.ledger_read_snapshot(p_business_id uuid,p_snapshot_id uuid)
returns jsonb language sql security invoker set search_path='' as $$ select app_private.ledger_read_snapshot(p_business_id,p_snapshot_id); $$;

-- Helpers remain inaccessible; only authorized boundary functions are callable.
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('app_private','public') and p.proname like 'ledger_%'
  loop execute format('revoke all on function %s from public, anon, authenticated',f.signature); end loop;
  for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('app_private','public') and p.proname in ('ledger_mutate','ledger_list','ledger_detail','ledger_summary','ledger_snapshot','ledger_read_snapshot')
  loop execute format('grant execute on function %s to authenticated',f.signature); end loop;
end $$;
comment on table public.transaction_payments is 'Separate linked settlement events. Active payments cannot exceed the accepted original amount; no refund or overpayment model is implied.';
comment on table public.ledger_snapshots is 'Immutable accepted-record versions and payment-event snapshot; not filed, paid, registered books, or a verified tax calculation.';

-- Serialize legacy creation with the new per-business version updates as well.
-- Strengthening this existing lock leaves the v1 command/result contract intact.
do $$
declare v_definition text;
begin
  select pg_get_functiondef('app_private.accept_manual_transaction(uuid,uuid,jsonb)'::regprocedure) into v_definition;
  execute replace(v_definition,'and owner_id = v_actor for share','and owner_id = v_actor for update');
end $$;
