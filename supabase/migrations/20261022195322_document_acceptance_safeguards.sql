-- Additive safeguards; existing source acceptances and original snapshots are retained.
create or replace function app_private.document_command(p_business_id uuid,p_document_id uuid,p_operation_id uuid,p_expected_revision integer,p_action text,p_values jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_actor uuid:=auth.uid(); v_document public.source_documents%rowtype;
 v_command jsonb:=jsonb_build_object('documentId',p_document_id,'expectedRevision',p_expected_revision,'action',p_action,'values',p_values);
 v_receipt app_private.document_receipts%rowtype; v_result jsonb; v_row jsonb; v_rows jsonb;
 v_row_id uuid; v_accept public.document_row_acceptances%rowtype; v_path text; v_kind text; v_uploaded boolean;
begin
 if v_actor is null then raise exception using errcode='42501',message='UNAUTHENTICATED'; end if;
 if not exists(select 1 from public.businesses where id=p_business_id and owner_id=v_actor) then
  raise exception using errcode='42501',message='FORBIDDEN'; end if;
 -- Acquire the same business lock before any operation lock as ledger_mutate.
 if p_action='accept' then perform 1 from public.businesses where id=p_business_id and owner_id=v_actor for update; end if;
 if p_document_id is null or p_operation_id is null or p_expected_revision is null or p_expected_revision<0
  or p_action is null or jsonb_typeof(p_values) is distinct from 'object' then
  raise exception using errcode='22023',message='VALIDATION_FAILED'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('document-op:'||p_business_id::text||':'||p_operation_id::text,0));
 select * into v_receipt from app_private.document_receipts where business_id=p_business_id and operation_id=p_operation_id;
 if found then
  if v_receipt.actor_id<>v_actor or v_receipt.command<>v_command then raise exception using errcode='P0001',message='OPERATION_CONFLICT'; end if;
  return v_receipt.result;
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('document:'||p_document_id::text,0));
 select * into v_document from public.source_documents where id=p_document_id for update;
 if p_action='register' then
   if found or p_expected_revision<>0 or coalesce(p_values->>'sourceType','') not in ('sales_notebook','expense_notebook')
   or coalesce(p_values->>'mimeType','') not in ('image/jpeg','image/png')
   or (p_values->>'sha256') is null or (p_values->>'sha256') !~ '^[a-f0-9]{64}$'
   or (p_values->>'byteSize') is null or (p_values->>'byteSize') !~ '^[0-9]{1,7}$'
   or (p_values->>'byteSize')::integer not between 1 and 4194304 then raise exception using errcode='22023',message='VALIDATION_FAILED'; end if;
  v_path:=p_business_id::text||'/'||p_document_id::text||'/original.'||case when p_values->>'mimeType'='image/png' then 'png' else 'jpg' end;
  insert into public.source_documents(id,business_id,source_type,object_path,mime_type,byte_size,sha256,created_by)
   values(p_document_id,p_business_id,p_values->>'sourceType',v_path,p_values->>'mimeType',(p_values->>'byteSize')::integer,p_values->>'sha256',v_actor)
   returning * into v_document;
 else
  if not found or v_document.business_id<>p_business_id then raise exception using errcode='42501',message='FORBIDDEN'; end if;
  if v_document.revision<>p_expected_revision then raise exception using errcode='P0001',message='DOCUMENT_CONFLICT'; end if;
  if p_action='uploaded' then
   if v_document.state<>'uploading' then raise exception using errcode='P0001',message='DOCUMENT_CONFLICT'; end if;
   if to_regclass('storage.objects') is not null then
    execute 'select exists(select 1 from storage.objects where bucket_id=$1 and name=$2)' into v_uploaded using 'notebook-sources',v_document.object_path;
    if not v_uploaded then raise exception using errcode='22023',message='UPLOAD_INCOMPLETE'; end if;
   end if;
   update public.source_documents set state='uploaded',failure_code=null where id=p_document_id;
  elsif p_action='failed' then
   if p_values->>'code' not in ('OCR_NOT_CONFIGURED','OCR_FAILED','UPLOAD_FAILED') then raise exception using errcode='22023',message='VALIDATION_FAILED'; end if;
   update public.source_documents set state='failed',failure_code=p_values->>'code' where id=p_document_id;
  elsif p_action in ('review','extracted') then
   if v_document.state='uploading' or jsonb_typeof(p_values->'rows') is distinct from 'array' or jsonb_array_length(p_values->'rows')>50 then raise exception using errcode='22023',message='VALIDATION_FAILED'; end if;
   v_rows:=p_values->'rows';
   for v_row in select value from jsonb_array_elements(v_rows) loop
    if jsonb_typeof(v_row)<>'object' or (v_row->>'id') is null or (v_row->>'id') !~ '^[a-f0-9-]{36}$'
     or (v_row->>'page') is distinct from '1' or (v_row->>'line') is null or (v_row->>'line') !~ '^[0-9]{1,4}$'
     or coalesce(v_row->>'kind','') not in ('sale','expense','unknown') or coalesce(v_row->>'paymentStatus','') not in ('paid','unpaid','partial','unknown')
     or length(coalesce(v_row->>'description',''))>500 or length(coalesce(v_row->>'amount',''))>32
     or length(coalesce(v_row->>'businessDate',''))>10 or length(coalesce(v_row->>'sourceText',''))>1000 then
      raise exception using errcode='22023',message='VALIDATION_FAILED'; end if;
   end loop;
   if (select count(*) from jsonb_array_elements(v_rows))<>(select count(distinct value->>'id') from jsonb_array_elements(v_rows)) then raise exception using errcode='22023',message='VALIDATION_FAILED'; end if;
   if exists(select 1 from public.document_row_acceptances a where a.document_id=p_document_id and
    not exists(select 1 from jsonb_array_elements(v_rows) r where (r->>'id')::uuid=a.row_id and r=(select old from jsonb_array_elements(v_document.proposals) old where (old->>'id')::uuid=a.row_id))) then
     raise exception using errcode='P0001',message='ACCEPTED_ROW_LOCKED'; end if;
   if p_action='extracted' and (v_document.original_extraction is not null or exists(select 1 from public.document_row_acceptances where document_id=p_document_id)) then
    raise exception using errcode='P0001',message='DOCUMENT_CONFLICT'; end if;
   update public.source_documents set proposals=v_rows,state='review',failure_code=null,
    original_extraction=case when p_action='extracted' then p_values->'extraction' else original_extraction end where id=p_document_id;
  elsif p_action='accept' then
   -- A new source acceptance must create a new ledger operation. Matching an older
   -- raw-ledger receipt must never reclassify an existing record's provenance.
   perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_business_id::text||':'||p_operation_id::text,0));
   if exists(select 1 from app_private.ledger_operations where business_id=p_business_id and operation_id=p_operation_id)
    or exists(select 1 from app_private.transaction_mutations where business_id=p_business_id and operation_id=p_operation_id) then
     raise exception using errcode='P0001',message='OPERATION_CONFLICT'; end if;
   v_row_id:=(p_values->>'rowId')::uuid;
   select * into v_accept from public.document_row_acceptances where document_id=p_document_id and row_id=v_row_id;
   if found then raise exception using errcode='P0001',message='ROW_ALREADY_ACCEPTED'; end if;
   select value into v_row from jsonb_array_elements(v_document.proposals) where value->>'id'=v_row_id::text;
   if v_row is null or v_document.state<>'review' or p_values->'reviewConfirmed' is distinct from 'true'::jsonb
    or p_values->'duplicateReviewed' is distinct from 'true'::jsonb then raise exception using errcode='22023',message='VALIDATION_FAILED'; end if;
   v_kind:=v_row->>'kind';
   if coalesce(v_kind,'') not in ('sale','expense') or coalesce(v_row->>'amount','') !~ '^[0-9]{1,10}([.][0-9]{1,2})?$' or coalesce(v_row->>'paymentStatus','') not in ('paid','unpaid','partial','unknown') then
    raise exception using errcode='22023',message='VALIDATION_FAILED'; end if;
   if v_row->>'paymentStatus'='partial' and coalesce(v_row->>'paymentAmount','') !~ '^[0-9]{1,10}([.][0-9]{1,2})?$' then
    raise exception using errcode='22023',message='VALIDATION_FAILED'; end if;
   v_result:=app_private.ledger_mutate(p_business_id,p_operation_id,'create',null,0,
    jsonb_build_object('businessDate',v_row->>'businessDate','kind',v_kind,
     'amountCentavos',(((v_row->>'amount')::numeric*100)::bigint)::text,
     'description',nullif(btrim(v_row->>'description'),''),
     'paymentStatus',v_row->>'paymentStatus',
     'paymentAmountCentavos',case when v_row->>'paymentStatus'='paid' then (((v_row->>'amount')::numeric*100)::bigint)::text when v_row->>'paymentStatus'='partial' then (((v_row->>'paymentAmount')::numeric*100)::bigint)::text else null end,
     'paymentDate',case when v_row->>'paymentStatus' in ('paid','partial') then v_row->>'paymentDate' else null end));
   update public.transactions set source='document_review' where business_id=p_business_id and id=(v_result->>'id')::uuid;
   update app_private.transaction_revisions set source='document_review' where business_id=p_business_id and transaction_id=(v_result->>'id')::uuid and revision=1;
   insert into public.transaction_sources(business_id,transaction_id,document_id,row_id,source_type)
    values(p_business_id,(v_result->>'id')::uuid,p_document_id,v_row_id,v_document.source_type);
   insert into public.document_row_acceptances(business_id,document_id,row_id,transaction_id,actor_id)
    values(p_business_id,p_document_id,v_row_id,(v_result->>'id')::uuid,v_actor);
  else raise exception using errcode='22023',message='VALIDATION_FAILED';
  end if;
  update public.source_documents set revision=revision+1,updated_at=now() where id=p_document_id returning * into v_document;
 end if;
 insert into app_private.document_revisions(document_id,revision,actor_id,action,content)
  values(p_document_id,v_document.revision,v_actor,p_action,jsonb_build_object('proposals',v_document.proposals,'state',v_document.state,'result',v_result));
 v_result:=jsonb_build_object('id',p_document_id,'revision',v_document.revision,'transaction',v_result);
 insert into app_private.document_receipts(business_id,operation_id,actor_id,command,result) values(p_business_id,p_operation_id,v_actor,v_command,v_result);
 return v_result;
end $$;

-- Source ownership is also a relational invariant, not merely a UI/service check.
alter table public.transaction_sources add constraint transaction_sources_document_fk
 foreign key(business_id,document_id) references public.source_documents(business_id,id) on delete restrict;
create function app_private.valid_document_proposals(p_rows jsonb)
returns boolean language sql immutable set search_path='' as $$
 select jsonb_typeof(p_rows)='array' and jsonb_array_length(p_rows)<=50 and not exists(
  select 1 from jsonb_array_elements(p_rows) r where
   jsonb_typeof(r)<>'object' or coalesce(r->>'page','')<>'1'
   or coalesce(r->>'line','')!~'^[1-9][0-9]{0,3}$'
   or coalesce(r->>'id','')!~'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
   or jsonb_typeof(r->'uncertainties') is distinct from 'array'
   or length(coalesce(r->>'paymentAmount',''))>32 or length(coalesce(r->>'paymentDate',''))>10
 );
$$;
revoke all on function app_private.valid_document_proposals(jsonb) from public,anon,authenticated;
alter table public.source_documents add constraint source_document_proposals_locators
 check(app_private.valid_document_proposals(proposals));
-- Only a definitive failed job may be cleared by the server adapter; uncertain polls retain it.
create or replace function app_private.document_provider_job(p_business_id uuid,p_document_id uuid,p_operation_url text default null)
returns text language plpgsql security definer set search_path='' as $$
declare v_url text;
begin
 if auth.uid() is null then raise exception using errcode='42501',message='UNAUTHENTICATED'; end if;
 if not exists(select 1 from public.source_documents d join public.businesses b on b.id=d.business_id
  where d.id=p_document_id and d.business_id=p_business_id and b.owner_id=auth.uid()) then
  raise exception using errcode='42501',message='FORBIDDEN'; end if;
 if p_operation_url='' then delete from app_private.document_provider_jobs where document_id=p_document_id; return null; end if;
 if p_operation_url is not null then
  if length(p_operation_url)>2000 or p_operation_url !~ '^https://' then raise exception using errcode='22023',message='VALIDATION_FAILED'; end if;
  insert into app_private.document_provider_jobs(document_id,operation_url) values(p_document_id,p_operation_url) on conflict(document_id) do nothing;
 end if;
 select operation_url into v_url from app_private.document_provider_jobs where document_id=p_document_id;
 return v_url;
end $$;

