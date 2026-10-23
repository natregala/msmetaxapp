-- Preserve explicit paid-zero meaning across corrections without creating
-- zero-valued payment events or changing unknown/unpaid records. Existing
-- linked-payment balance checks and all authorization/replay behavior remain.
create or replace function app_private.ledger_mutate(p_business_id uuid,p_operation_id uuid,p_action text,p_record_id uuid,p_expected_revision integer,p_values jsonb)
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
      update public.transactions set amount_centavos=v_amount,business_date=v_date,kind=v_kind,description=v_description,
        -- A known paid zero has no positive payment row. Preserve that explicit
        -- meaning while keeping a corrected zero record's direction valid.
        money_movement=case when v_amount=0 and v_record.amount_centavos=0
          and payment_knowledge='known' and money_movement in ('in','out')
          then case when v_kind in ('sale','owner_contribution','loan_received','transfer_in') then 'in' else 'out' end
          else money_movement end
        where id=p_record_id;
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
      if p_values->>'paymentKnowledge'='known' and v_record.kind not in ('sale','expense') and v_total<>v_record.amount_centavos then raise exception using errcode='P0001',message='CLARIFICATION_REQUIRED'; end if;
      update public.transactions set payment_knowledge=p_values->>'paymentKnowledge' where id=p_record_id;
    elsif p_action in ('add_payment','correct_payment','void_payment') then
      if p_action='add_payment' and v_record.kind not in ('sale','expense','owner_contribution','owner_withdrawal') then raise exception using errcode='22023',message='UNSUPPORTED_SETTLEMENT'; end if;
      if v_record.payment_knowledge='unknown' and not (p_action='add_payment' and v_record.kind in ('owner_contribution','owner_withdrawal')) then raise exception using errcode='P0001',message='CLARIFICATION_REQUIRED'; end if;
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
        if p_action='add_payment' and v_record.kind in ('owner_contribution','owner_withdrawal') and v_total+v_amount<>v_record.amount_centavos then raise exception using errcode='22023',message='INVALID_PAYMENT'; end if;
        if v_date<v_record.business_date then raise exception using errcode='22023',message='PAYMENT_BEFORE_RECORD'; end if;
        if p_action='add_payment' then
          if v_record.kind in ('owner_contribution','owner_withdrawal') then
            update public.transactions set payment_knowledge='known' where id=p_record_id;
          end if;
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
        when v_total>0 or kind not in ('sale','expense')
          or (amount_centavos=0 and v_record.amount_centavos=0 and v_record.money_movement in ('in','out')) then
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

