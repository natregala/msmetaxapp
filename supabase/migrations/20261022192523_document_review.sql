-- Bounded notebook-source workflow. Originals are immutable; proposals never post themselves.
create table public.source_documents (
 id uuid primary key,
 business_id uuid not null references public.businesses(id) on delete restrict,
 source_type text not null check (source_type in ('sales_notebook','expense_notebook')),
 object_path text not null unique,
 mime_type text not null check (mime_type in ('image/jpeg','image/png')),
 byte_size integer not null check (byte_size between 1 and 4194304),
 sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
 state text not null default 'uploading' check (state in ('uploading','uploaded','review','failed')),
 revision integer not null default 1 check (revision > 0),
 proposals jsonb not null default '[]' check (jsonb_typeof(proposals) = 'array'),
 original_extraction jsonb,
 failure_code text,
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(business_id,id)
);
create index source_documents_business_created_idx on public.source_documents(business_id,created_at desc);
create index source_documents_business_hash_idx on public.source_documents(business_id,sha256);
create table app_private.document_revisions (
 document_id uuid not null references public.source_documents(id),
 revision integer not null,
 actor_id uuid not null references auth.users(id),
 action text not null,
 content jsonb not null,
 recorded_at timestamptz not null default now(),
 primary key(document_id,revision)
);
create table app_private.document_receipts (
 business_id uuid not null references public.businesses(id),
 operation_id uuid not null,
 actor_id uuid not null references auth.users(id),
 command jsonb not null,
 result jsonb not null,
 primary key(business_id,operation_id)
);
create table public.document_row_acceptances (
 business_id uuid not null,
 document_id uuid not null,
 row_id uuid not null,
 transaction_id uuid not null,
 actor_id uuid not null references auth.users(id),
 accepted_at timestamptz not null default now(),
 primary key(document_id,row_id),
 foreign key(business_id,document_id) references public.source_documents(business_id,id),
 foreign key(business_id,transaction_id) references public.transactions(business_id,id)
);
alter table public.source_documents enable row level security;
alter table public.document_row_acceptances enable row level security;
alter table app_private.document_revisions enable row level security;
alter table app_private.document_receipts enable row level security;
create policy source_documents_read_own on public.source_documents for select to authenticated
 using (business_id in (select id from public.businesses where owner_id=(select auth.uid())));
create policy document_acceptances_read_own on public.document_row_acceptances for select to authenticated
 using (business_id in (select id from public.businesses where owner_id=(select auth.uid())));
revoke all on public.source_documents,public.document_row_acceptances,app_private.document_revisions,app_private.document_receipts from public,anon,authenticated;
grant select on public.source_documents,public.document_row_acceptances to authenticated;

create function app_private.document_read(p_business_id uuid,p_document_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_document public.source_documents%rowtype;
begin
 if auth.uid() is null then raise exception using errcode='42501',message='UNAUTHENTICATED'; end if;
 if not exists(select 1 from public.businesses where id=p_business_id and owner_id=auth.uid()) then
  raise exception using errcode='42501',message='FORBIDDEN';
 end if;
 if p_document_id is null then
  return jsonb_build_object('documents',coalesce((select jsonb_agg(to_jsonb(d) - 'proposals' - 'original_extraction' order by d.created_at desc)
   from (select * from public.source_documents where business_id=p_business_id order by created_at desc limit 100) d),'[]'::jsonb));
 end if;
 select * into v_document from public.source_documents where id=p_document_id and business_id=p_business_id;
 if not found then raise exception using errcode='42501',message='FORBIDDEN'; end if;
 return jsonb_build_object('document',to_jsonb(v_document),
  'acceptedRows',coalesce((select jsonb_agg(jsonb_build_object('rowId',row_id,'transactionId',transaction_id)) from public.document_row_acceptances where document_id=p_document_id),'[]'::jsonb),
  'history',coalesce((select jsonb_agg(jsonb_build_object('revision',revision,'action',action,'recordedAt',recorded_at,'actorId',actor_id,'content',content) order by revision)
  from app_private.document_revisions where document_id=p_document_id),'[]'::jsonb),
  'duplicateDocuments',coalesce((select jsonb_agg(jsonb_build_object('id',id,'createdAt',created_at)) from public.source_documents where business_id=p_business_id and sha256=v_document.sha256 and id<>p_document_id),'[]'::jsonb),
  'duplicateRecords',coalesce((select jsonb_agg(candidate) from (
    select jsonb_build_object('rowId',r->>'id','transactionId',t.id,'businessDate',t.business_date,
      'amountCentavos',t.amount_centavos::text,'description',t.description) as candidate
    from jsonb_array_elements(v_document.proposals) r join public.transactions t
    on t.business_id=p_business_id and t.kind=r->>'kind' and t.business_date::text=r->>'businessDate'
     and t.amount_centavos=case when r->>'amount' ~ '^[0-9]{1,10}([.][0-9]{1,2})?$' then ((r->>'amount')::numeric*100)::bigint else null end
    where not exists(select 1 from public.document_row_acceptances a where a.document_id=p_document_id and a.row_id=(r->>'id')::uuid and a.transaction_id=t.id)
    limit 50) matches),'[]'::jsonb));
end $$;

create function app_private.document_command(p_business_id uuid,p_document_id uuid,p_operation_id uuid,p_expected_revision integer,p_action text,p_values jsonb)
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
     'paymentDate',case when v_row->>'paymentStatus'='paid' then v_row->>'businessDate' when v_row->>'paymentStatus'='partial' then v_row->>'paymentDate' else null end));
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
create function public.document_read(p_business_id uuid,p_document_id uuid default null)
returns jsonb language sql security invoker set search_path='' as $$ select app_private.document_read(p_business_id,p_document_id); $$;
create function public.document_command(p_business_id uuid,p_document_id uuid,p_operation_id uuid,p_expected_revision integer,p_action text,p_values jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select app_private.document_command(p_business_id,p_document_id,p_operation_id,p_expected_revision,p_action,p_values); $$;
revoke all on function app_private.document_read(uuid,uuid),app_private.document_command(uuid,uuid,uuid,integer,text,jsonb),public.document_read(uuid,uuid),public.document_command(uuid,uuid,uuid,integer,text,jsonb) from public,anon,authenticated;
grant execute on function app_private.document_read(uuid,uuid),app_private.document_command(uuid,uuid,uuid,integer,text,jsonb),public.document_read(uuid,uuid),public.document_command(uuid,uuid,uuid,integer,text,jsonb) to authenticated;

create table app_private.document_provider_jobs (
 document_id uuid primary key references public.source_documents(id),
 operation_url text not null,
 created_at timestamptz not null default now()
);
alter table app_private.document_provider_jobs enable row level security;
revoke all on app_private.document_provider_jobs from public,anon,authenticated;
create function app_private.document_provider_job(p_business_id uuid,p_document_id uuid,p_operation_url text default null)
returns text language plpgsql security definer set search_path='' as $$
declare v_url text;
begin
 if auth.uid() is null then raise exception using errcode='42501',message='UNAUTHENTICATED'; end if;
 if not exists(select 1 from public.source_documents d join public.businesses b on b.id=d.business_id
  where d.id=p_document_id and d.business_id=p_business_id and b.owner_id=auth.uid()) then
  raise exception using errcode='42501',message='FORBIDDEN'; end if;
 if p_operation_url is not null then
  if length(p_operation_url)>2000 or p_operation_url !~ '^https://' then raise exception using errcode='22023',message='VALIDATION_FAILED'; end if;
  insert into app_private.document_provider_jobs(document_id,operation_url) values(p_document_id,p_operation_url) on conflict(document_id) do nothing;
 end if;
 select operation_url into v_url from app_private.document_provider_jobs where document_id=p_document_id;
 return v_url;
end $$;
create function public.document_provider_job(p_business_id uuid,p_document_id uuid,p_operation_url text default null)
returns text language sql security invoker set search_path='' as $$ select app_private.document_provider_job(p_business_id,p_document_id,p_operation_url); $$;
revoke all on function app_private.document_provider_job(uuid,uuid,text),public.document_provider_job(uuid,uuid,text) from public,anon,authenticated;
grant execute on function app_private.document_provider_job(uuid,uuid,text),public.document_provider_job(uuid,uuid,text) to authenticated;

-- Storage exists in hosted Supabase; embedded Postgres tests may not install Storage.
do $storage$
begin
 if to_regclass('storage.buckets') is not null then
  execute $sql$insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
   values('notebook-sources','notebook-sources',false,4194304,array['image/jpeg','image/png']) on conflict(id) do nothing$sql$;
  execute $sql$create policy notebook_source_insert on storage.objects for insert to authenticated with check (
   bucket_id='notebook-sources' and exists(select 1 from public.source_documents d join public.businesses b on b.id=d.business_id
    where d.object_path=storage.objects.name and d.state='uploading' and b.owner_id=(select auth.uid())))$sql$;
  execute $sql$create policy notebook_source_read on storage.objects for select to authenticated using (
   bucket_id='notebook-sources' and exists(select 1 from public.source_documents d join public.businesses b on b.id=d.business_id
    where d.object_path=storage.objects.name and b.owner_id=(select auth.uid())))$sql$;
 end if;
end $storage$;
