-- A scan reads human edits before the worker publishes a new revision to the same sheet.
alter table public.block_plans add column plan_revision integer not null default 1 check (plan_revision > 0);

create table public.block_sheet_scans (
    user_id uuid primary key references public.block_plans(user_id) on delete cascade,
    lease_token uuid,
    lease_until timestamptz,
    available_at timestamptz not null default now(),
    failures integer not null default 0,
    last_sheet_plan_revision integer,
    last_scanned_at timestamptz
);

create table public.block_sheet_conflicts (
    user_id uuid not null references public.block_plans(user_id) on delete cascade,
    plan_id uuid not null references public.block_plans(plan_id) on delete cascade,
    session_key text not null,
    sheet_row integer check (sheet_row >= 2),
    reason text not null,
    detected_at timestamptz not null default now(),
    primary key (user_id, session_key)
);
alter table public.block_sheet_scans enable row level security;
alter table public.block_sheet_conflicts enable row level security;
create policy read_own_sheet_conflicts on public.block_sheet_conflicts for select to authenticated
    using (user_id = (select auth.uid()));
revoke all on public.block_sheet_scans, public.block_sheet_conflicts from public, anon, authenticated, service_role;
grant select on public.block_sheet_scans, public.block_sheet_conflicts to service_role;
grant select on public.block_sheet_conflicts to authenticated;

create function public.block_plan_revision_on_change() returns trigger
language plpgsql set search_path = '' as $$
begin
    new.plan_revision := old.plan_revision + (new.routine is distinct from old.routine)::integer;
    return new;
end;
$$;
create trigger block_plan_revision before update on public.block_plans
    for each row execute function public.block_plan_revision_on_change();

create function public.reset_block_sheet_scan() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
    if tg_op = 'UPDATE' and (new.plan_id,new.spreadsheet_id) is not distinct from (old.plan_id,old.spreadsheet_id) then
        return new;
    end if;
    delete from public.block_sheet_conflicts where user_id = new.user_id;
    insert into public.block_sheet_scans(user_id) values (new.user_id)
    on conflict (user_id) do update set lease_token = null, lease_until = null, failures = 0,
        available_at = now(), last_scanned_at = null, last_sheet_plan_revision = null;
    return new;
end;
$$;
create trigger block_plan_scan_target after insert or update of plan_id, spreadsheet_id on public.block_plans
    for each row execute function public.reset_block_sheet_scan();
insert into public.block_sheet_scans(user_id) select user_id from public.block_plans;

create function public.claim_block_sheet_scans(p_limit integer default 10, p_user_id uuid default null)
returns table(user_id uuid, plan_id uuid, spreadsheet_id text, lease_token uuid, plan_revision integer, last_sheet_plan_revision integer)
language plpgsql security definer set search_path = '' as $$
begin
    -- Serialize only the short claim statements, never the external network request. A fresh
    -- READ COMMITTED snapshot after this lock sees claims made by the other worker kind.
    if not pg_try_advisory_xact_lock(hashtextextended('gym-tracker/v4/sheet-claims',0)) then return; end if;
    return query
    with eligible as (
        select s.user_id, p.plan_id, p.spreadsheet_id, p.plan_revision, s.last_sheet_plan_revision,
            exists(select from public.block_workout_exports e join public.block_workouts w using (user_id, session_key)
                where e.user_id = s.user_id and e.delivered_revision < w.revision and e.available_at <= now()
                and not exists (select from public.block_sheet_conflicts c where c.user_id = e.user_id
                    and (c.session_key = '' or c.session_key = e.session_key or c.sheet_row = w.sheet_row))) as has_work
        from public.block_sheet_scans s join public.block_plans p on p.user_id=s.user_id
        where p.spreadsheet_id is not null and (p_user_id is null or p_user_id=s.user_id)
            and (s.lease_until is null or s.lease_until <= now())
            and not exists(select from public.block_workout_exports e where e.user_id=s.user_id and e.lease_until > now())
            and (s.available_at <= now() or s.failures=0)
    ), ready as materialized (
        select e.* from eligible e join public.block_sheet_scans s using(user_id)
        where s.available_at <= now() or e.has_work
        order by s.last_scanned_at nulls first, s.available_at, s.user_id
        limit greatest(0,least(coalesce(p_limit,10),100))
        for update of s skip locked
    )
    update public.block_sheet_scans s set lease_token=gen_random_uuid(), lease_until=now()+interval '10 minutes'
    from ready r where s.user_id=r.user_id
    returning s.user_id,r.plan_id,r.spreadsheet_id,s.lease_token,r.plan_revision,s.last_sheet_plan_revision;
end;
$$;

create function public.finish_block_sheet_scan(p_user_id uuid, p_plan_id uuid, p_lease_token uuid, p_success boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
    update public.block_sheet_scans s
    set lease_token=null, lease_until=null,
        available_at=now()+case when p_success then interval '1 minute'
            else make_interval(secs => least(3600, 5*(1<<least(10,s.failures)))) end,
        last_scanned_at=case when p_success then now() else s.last_scanned_at end,
        failures=case when p_success then 0 else least(10,s.failures+1) end
    from public.block_plans p where p.user_id=s.user_id and p.plan_id=p_plan_id and s.user_id=p_user_id
        and s.lease_token=p_lease_token and p_success is not null;
    return found;
end;
$$;

-- Keep assignment/target changes, scan renewal, imports and conflict updates ordered.
create function public.lock_block_sheet_scan(p_user_id uuid,p_plan_id uuid,p_lease_token uuid)
returns void language plpgsql set search_path = '' as $$
begin
    perform 1 from public.block_plans p where p.user_id=p_user_id and p.plan_id=p_plan_id
        and p.spreadsheet_id is not null for update;
    if not found then raise exception 'Sheet assignment changed' using errcode='40001'; end if;
    perform 1 from public.block_sheet_scans s where s.user_id=p_user_id and s.lease_token=p_lease_token
        and s.lease_until>clock_timestamp() for update;
    if not found then raise exception 'Sheet scan lease expired' using errcode='40001'; end if;
end;
$$;

create function public.record_block_sheet_conflict(p_user_id uuid,p_plan_id uuid,p_lease_token uuid,
    p_session_key text,p_sheet_row integer,p_reason text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
    perform public.lock_block_sheet_scan(p_user_id,p_plan_id,p_lease_token);
    if p_session_key is null or p_reason is null or btrim(p_reason)='' then
        raise exception 'Conflict identity and reason are required' using errcode='22023';
    end if;
    insert into public.block_sheet_conflicts(user_id,plan_id,session_key,sheet_row,reason)
    values (p_user_id,p_plan_id,p_session_key,p_sheet_row,left(p_reason,4096))
    on conflict (user_id,session_key) do update set sheet_row=excluded.sheet_row,reason=excluded.reason
    where (block_sheet_conflicts.sheet_row,block_sheet_conflicts.reason) is distinct from (excluded.sheet_row,excluded.reason);
    return true;
end;
$$;

create function public.clear_block_sheet_conflict(p_user_id uuid,p_plan_id uuid,p_lease_token uuid,
    p_session_key text) returns boolean language plpgsql security definer set search_path = '' as $$
begin
    perform public.lock_block_sheet_scan(p_user_id,p_plan_id,p_lease_token);
    delete from public.block_sheet_conflicts where user_id=p_user_id and session_key=p_session_key;
    return found;
end;
$$;

-- One validator and compare-and-swap path for device edits and leased server imports.
create function public.store_block_workout(
    athlete uuid, p_session_key text, p_workout jsonb, p_expected_revision integer, p_plan_id uuid, p_sheet_row integer
) returns integer
language plpgsql set search_path = '' as $$
declare
    plan public.block_plans%rowtype;
    existing public.block_workouts%rowtype;
    parts jsonb;
    exercises jsonb;
    item record;
    series jsonb;
    canonical_key text;
    new_row integer;
    new_revision integer;
begin
    if athlete is null then
        raise exception 'Authentication required' using errcode = '42501';
    end if;
    if p_session_key is null or octet_length(p_session_key) > 4096
        or p_expected_revision is null or p_expected_revision < 0 then
        raise exception 'Invalid session key or revision' using errcode = '22023';
    end if;

    -- Serialize this athlete's saves, including first inserts and sheet row allocation.
    select * into plan from public.block_plans where user_id = athlete for update;
    if not found or (p_plan_id is not null and p_plan_id <> plan.plan_id) then
        raise exception 'Workout plan is not assigned' using errcode = '22023';
    end if;

    begin
        parts := p_session_key::jsonb;
    exception when invalid_text_representation then
        raise exception 'Invalid session key' using errcode = '22023';
    end;
    if jsonb_typeof(parts) <> 'array' then
        raise exception 'Invalid session key' using errcode = '22023';
    end if;
    canonical_key := '[' || (parts -> 0)::text || ',' || (parts -> 1)::text || ',' || (parts -> 2)::text || ']';
    if canonical_key is distinct from p_session_key or jsonb_typeof(parts -> 0) <> 'string'
        or jsonb_typeof(parts -> 1) <> 'number' or (parts ->> 1) !~ '^-?[0-9]+$'
        or jsonb_typeof(parts -> 2) <> 'number' or (parts ->> 2) !~ '^-?[0-9]+$' then
        raise exception 'Invalid session key' using errcode = '22023';
    end if;

    select d -> 'exercises' into exercises
    from jsonb_array_elements(plan.routine -> 'blocks') b,
        lateral jsonb_array_elements(b -> 'weeks') w,
        lateral jsonb_array_elements(w -> 'days') d
    where b -> 'id' = parts -> 0 and w -> 'number' = parts -> 1 and d -> 'number' = parts -> 2;
    if not found or jsonb_typeof(exercises) is distinct from 'array' then
        raise exception 'Day is not in the assigned plan' using errcode = '22023';
    end if;

    if jsonb_typeof(p_workout) is distinct from 'object' or octet_length(p_workout::text) > 524288
        or jsonb_typeof(p_workout -> 'sets') is distinct from 'object'
        or jsonb_typeof(p_workout -> 'note') is distinct from 'string'
        or not (p_workout ? 'rating') or (p_workout -> 'rating') not in ('null','1','2','3')
        or jsonb_typeof(p_workout -> 'startedAt') is distinct from 'string'
        or (p_workout ->> 'startedAt') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+(Z|[+-][0-9]{2}:[0-9]{2})$'
        or (p_workout ? 'finishedAt' and (jsonb_typeof(p_workout -> 'finishedAt') <> 'string'
            or (p_workout ->> 'finishedAt') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+(Z|[+-][0-9]{2}:[0-9]{2})$'))
        or (p_workout ? 'exerciseNotes' and jsonb_typeof(p_workout -> 'exerciseNotes') <> 'object')
        or (p_workout ? 'completed' and jsonb_typeof(p_workout -> 'completed') <> 'object')
        or (p_workout ? 'legacyNote' and jsonb_typeof(p_workout -> 'legacyNote') <> 'string') then
        raise exception 'Invalid workout' using errcode = '22023';
    end if;
    begin
        perform (p_workout ->> 'startedAt')::timestamptz, (p_workout ->> 'finishedAt')::timestamptz;
    exception when invalid_datetime_format or datetime_field_overflow then
        raise exception 'Invalid workout date' using errcode = '22023';
    end;
    -- Preserve free-text reps, decimals and partial sets as the user enters them.
    for item in
        select 'sets' kind, f.* from jsonb_each(p_workout -> 'sets') f
        union all select 'completed', f.* from jsonb_each(p_workout -> 'completed') f
        union all select 'notes', f.* from jsonb_each(p_workout -> 'exerciseNotes') f
    loop
        if not exists (select 1 from jsonb_array_elements(exercises) e where e ->> 'id' = item.key) then
            raise exception 'Exercise is not in the assigned day' using errcode = '22023';
        end if;
        if item.kind = 'sets' then
            if jsonb_typeof(item.value) <> 'array' then
                raise exception 'Invalid set list' using errcode = '22023';
            end if;
            for series in select value from jsonb_array_elements(item.value) loop
                if not public.block_set_valid(series) or
                    (series ? 'beforePlan' and series -> 'beforePlan' <> 'null'::jsonb
                     and not public.block_set_valid(series -> 'beforePlan')) then
                    raise exception 'Invalid set' using errcode = '22023';
                end if;
            end loop;
        elsif (item.kind = 'completed' and jsonb_typeof(item.value) <> 'boolean')
            or (item.kind = 'notes' and jsonb_typeof(item.value) <> 'string') then
            raise exception 'Invalid exercise entry' using errcode = '22023';
        end if;
    end loop;

    select * into existing from public.block_workouts
        where user_id = athlete and session_key = p_session_key;
    if p_sheet_row is not null and (p_sheet_row<2 or (existing.sheet_row is not null and existing.sheet_row<>p_sheet_row)
        or exists (select from public.block_workouts where user_id=athlete and sheet_row=p_sheet_row and session_key<>p_session_key)) then
        raise exception 'The sheet row belongs to another session' using errcode='40001';
    end if;
    if existing.workout = p_workout then
        return existing.revision;
    end if;
    if coalesce(existing.revision, 0) <> p_expected_revision then
        raise exception 'Workout changed on another device' using errcode = '40001';
    end if;
    new_revision := p_expected_revision + 1;
    if existing.sheet_row is null then
        select coalesce(p_sheet_row, coalesce(max(sheet_row), 1) + 1) into new_row from public.block_workouts where user_id = athlete;
        insert into public.block_workouts (user_id, plan_id, session_key, workout, revision, sheet_row)
            values (athlete, plan.plan_id, p_session_key, p_workout, new_revision, new_row);
        insert into public.block_workout_exports (user_id, session_key) values (athlete, p_session_key);
    else
        update public.block_workouts set workout = p_workout, revision = new_revision
            where user_id = athlete and session_key = p_session_key;
    end if;
    return new_revision;
end;
$$;

create or replace function public.save_block_workout(p_session_key text,p_workout jsonb,p_expected_revision integer,p_plan_id uuid default null)
returns integer language sql security definer set search_path = '' as $$
    select public.store_block_workout(auth.uid(),p_session_key,p_workout,p_expected_revision,p_plan_id,null)
$$;

-- Replace the single-argument RPC rather than leaving ambiguous PostgREST overloads.
drop function public.claim_block_workout_exports(integer);
create function public.claim_block_workout_exports(p_limit integer default 10,p_user_id uuid default null)
returns table(user_id uuid, session_key text, spreadsheet_id text, sheet_row integer,
    revision integer, workout jsonb, lease_token uuid, exercise_names jsonb)
language plpgsql security definer set search_path = '' as $$
begin
    if not pg_try_advisory_xact_lock(hashtextextended('gym-tracker/v4/sheet-claims',0)) then return; end if;
    return query
    with ready as materialized (
        select e.user_id, e.session_key, w.revision, w.workout, w.sheet_row, p.spreadsheet_id,
            coalesce((select jsonb_object_agg(ex ->> 'id', ex ->> 'name')
                from jsonb_array_elements(p.routine -> 'blocks') b,
                    lateral jsonb_array_elements(b -> 'weeks') week,
                    lateral jsonb_array_elements(week -> 'days') day,
                    lateral jsonb_array_elements(day -> 'exercises') ex
                where b -> 'id' = e.session_key::jsonb -> 0 and week -> 'number' = e.session_key::jsonb -> 1
                    and day -> 'number' = e.session_key::jsonb -> 2), '{}'::jsonb) as exercise_names
        from public.block_workout_exports e
        join public.block_workouts w using (user_id, session_key)
        join public.block_plans p using (user_id)
        join public.block_sheet_scans s on s.user_id=e.user_id
        where (p_user_id is null or e.user_id=p_user_id) and (s.lease_until is null or s.lease_until<=now())
            and not exists (select from public.block_sheet_conflicts c where c.user_id=e.user_id
                and (c.session_key='' or c.session_key=e.session_key or c.sheet_row=w.sheet_row))
            and p.spreadsheet_id is not null and e.delivered_revision < w.revision
            and e.available_at <= now() and (e.lease_until is null or e.lease_until <= now())
        order by e.available_at, e.user_id, w.sheet_row
        limit greatest(0, least(coalesce(p_limit, 10), 100))
        for update of e skip locked
    )
    update public.block_workout_exports e
    set lease_token = gen_random_uuid(), lease_until = now() + interval '10 minutes', claimed_revision = r.revision
    from ready r where (e.user_id, e.session_key) = (r.user_id, r.session_key)
    returning r.user_id, r.session_key, r.spreadsheet_id, r.sheet_row, r.revision, r.workout, e.lease_token, r.exercise_names;
end;
$$;

create function public.apply_block_sheet_workout(p_user_id uuid,p_plan_id uuid,p_lease_token uuid,
    p_session_key text,p_workout jsonb,p_expected_revision integer,p_sheet_row integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
    version integer;
    actual_row integer;
begin
    perform public.lock_block_sheet_scan(p_user_id,p_plan_id,p_lease_token);
    version := public.store_block_workout(p_user_id,p_session_key,p_workout,p_expected_revision,p_plan_id,p_sheet_row);
    select w.sheet_row into strict actual_row from public.block_workouts w
        where (w.user_id,w.session_key)=(p_user_id,p_session_key);
    delete from public.block_sheet_conflicts where user_id=p_user_id
        and session_key in (p_session_key,'row:'||actual_row);
    return jsonb_build_object('revision',version,'sheet_row',actual_row);
end;
$$;

create function public.apply_block_sheet_plan(p_user_id uuid,p_plan_id uuid,p_lease_token uuid,
    p_routine jsonb,p_expected_revision integer) returns integer
language plpgsql security definer set search_path = '' as $$
declare
    plan public.block_plans%rowtype;
    last_synced integer;
begin
    perform public.lock_block_sheet_scan(p_user_id,p_plan_id,p_lease_token);
    select * into strict plan from public.block_plans where user_id=p_user_id;
    select last_sheet_plan_revision into last_synced from public.block_sheet_scans where user_id=p_user_id;
    if jsonb_typeof(p_routine->'blocks') is distinct from 'array' or jsonb_array_length(p_routine->'blocks')=0 then
        raise exception 'Invalid routine' using errcode='22023';
    end if;
    if plan.routine is distinct from p_routine then
        if plan.plan_revision is distinct from p_expected_revision
            or (last_synced is not null and last_synced<>plan.plan_revision) then
            raise exception 'Workout plan changed since previous sheet sync' using errcode='40001';
        end if;
        -- Removing a performed day or its logged exercise would make that history invisible.
        if exists (
            with days as (
                select b->>'id' as block, w->'number' as week, d->'number' as day, d->'exercises' as exercises
                from jsonb_array_elements(p_routine->'blocks') b,
                    lateral jsonb_array_elements(b->'weeks') w, lateral jsonb_array_elements(w->'days') d
            )
            select from public.block_workouts saved
            left join days on days.block=saved.session_key::jsonb->>0 and days.week=saved.session_key::jsonb->1
                and days.day=saved.session_key::jsonb->2
            where saved.user_id=p_user_id and (days.day is null or exists (
                select from jsonb_object_keys(coalesce(saved.workout->'sets','{}') ||
                    coalesce(saved.workout->'exerciseNotes','{}') || coalesce(saved.workout->'completed','{}')) as id
                where not exists(select from jsonb_array_elements(days.exercises) e where e->>'id'=id)
            ))
        ) then raise exception 'The edited plan would remove a recorded day or exercise' using errcode='40001'; end if;
        update public.block_plans set routine=p_routine where user_id=p_user_id returning plan_revision into plan.plan_revision;
    end if;
    update public.block_sheet_scans set last_sheet_plan_revision=plan.plan_revision where user_id=p_user_id;
    delete from public.block_sheet_conflicts where user_id=p_user_id and session_key='';
    return plan.plan_revision;
end;
$$;

revoke all on function public.block_plan_revision_on_change(),public.reset_block_sheet_scan(),
    public.lock_block_sheet_scan(uuid,uuid,uuid),public.store_block_workout(uuid,text,jsonb,integer,uuid,integer)
    from public,anon,authenticated,service_role;
revoke all on function public.claim_block_sheet_scans(integer,uuid),public.finish_block_sheet_scan(uuid,uuid,uuid,boolean),
    public.claim_block_workout_exports(integer,uuid),
    public.record_block_sheet_conflict(uuid,uuid,uuid,text,integer,text),public.clear_block_sheet_conflict(uuid,uuid,uuid,text),
    public.apply_block_sheet_workout(uuid,uuid,uuid,text,jsonb,integer,integer),
    public.apply_block_sheet_plan(uuid,uuid,uuid,jsonb,integer)
    from public,anon,authenticated;
grant execute on function public.claim_block_sheet_scans(integer,uuid),public.finish_block_sheet_scan(uuid,uuid,uuid,boolean),
    public.claim_block_workout_exports(integer,uuid),
    public.record_block_sheet_conflict(uuid,uuid,uuid,text,integer,text),public.clear_block_sheet_conflict(uuid,uuid,uuid,text),
    public.apply_block_sheet_workout(uuid,uuid,uuid,text,jsonb,integer,integer),
    public.apply_block_sheet_plan(uuid,uuid,uuid,jsonb,integer)
    to service_role;
