-- Assigned routines and completed work are private to the authenticated athlete.
create table public.block_plans (
    user_id uuid primary key references auth.users(id) on delete cascade,
    plan_id uuid not null unique default gen_random_uuid(),
    routine jsonb not null check (jsonb_typeof(routine -> 'blocks') is not distinct from 'array'),
    spreadsheet_id text unique check (length(btrim(spreadsheet_id)) > 0)
);

create table public.block_workouts (
    user_id uuid not null references public.block_plans(user_id) on delete cascade,
    plan_id uuid not null references public.block_plans(plan_id) on delete cascade,
    session_key text not null,
    workout jsonb not null,
    revision integer not null check (revision >= 1),
    sheet_row integer not null check (sheet_row >= 2),
    primary key (user_id, session_key),
    unique (user_id, sheet_row)
);

create table public.block_workout_exports (
    user_id uuid not null,
    session_key text not null,
    delivered_revision integer not null default 0,
    lease_token uuid,
    lease_until timestamptz,
    claimed_revision integer,
    available_at timestamptz not null default now(),
    failures integer not null default 0,
    primary key (user_id, session_key),
    foreign key (user_id, session_key) references public.block_workouts on delete cascade
);

alter table public.block_plans enable row level security;
alter table public.block_workouts enable row level security;
alter table public.block_workout_exports enable row level security;

create policy read_own_plan on public.block_plans for select to authenticated
    using (user_id = (select auth.uid()));
create policy read_own_workouts on public.block_workouts for select to authenticated
    using (user_id = (select auth.uid()));

revoke all on public.block_plans, public.block_workouts, public.block_workout_exports
    from public, anon, authenticated, service_role;
grant select on public.block_plans, public.block_workouts to authenticated;
grant select, insert, update, delete on public.block_plans to service_role;
grant select on public.block_workouts, public.block_workout_exports to service_role;

-- Both current rows and the beforePlan snapshots used by "uncheck exercise" have this shape.
create function public.block_set_valid(p_set jsonb) returns boolean
language sql immutable set search_path = '' as $$
    select coalesce(jsonb_typeof(p_set) = 'object'
        and jsonb_typeof(p_set -> 'reps') = 'string'
        and jsonb_typeof(p_set -> 'kg') = 'string'
        and jsonb_typeof(p_set -> 'effort') = 'string'
        and (not (p_set ? 'confirmed') or jsonb_typeof(p_set -> 'confirmed') = 'boolean'), false)
$$;
revoke all on function public.block_set_valid(jsonb) from public, anon, authenticated;

create function public.save_block_workout(
    p_session_key text, p_workout jsonb, p_expected_revision integer, p_plan_id uuid default null
) returns integer
language plpgsql security definer set search_path = '' as $$
declare
    athlete uuid := auth.uid();
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
    if existing.workout = p_workout then
        return existing.revision;
    end if;
    if coalesce(existing.revision, 0) <> p_expected_revision then
        raise exception 'Workout changed on another device' using errcode = '40001';
    end if;
    new_revision := p_expected_revision + 1;
    if existing.sheet_row is null then
        select coalesce(max(sheet_row), 1) + 1 into new_row from public.block_workouts where user_id = athlete;
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
revoke all on function public.save_block_workout(text,jsonb,integer,uuid) from public, anon, authenticated;
grant execute on function public.save_block_workout(text,jsonb,integer,uuid) to authenticated;

-- Retain one outbox entry per session. New saves coalesce and leave in-flight writes alone.
create function public.claim_block_workout_exports(p_limit integer default 10)
returns table(user_id uuid, session_key text, spreadsheet_id text, sheet_row integer,
    revision integer, workout jsonb, lease_token uuid, exercise_names jsonb)
language sql security definer set search_path = '' as $$
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
        where p.spreadsheet_id is not null and e.delivered_revision < w.revision
            and e.available_at <= now() and (e.lease_until is null or e.lease_until <= now())
        order by e.available_at, e.user_id, w.sheet_row
        limit greatest(0, least(coalesce(p_limit, 10), 100))
        for update of e skip locked
    )
    update public.block_workout_exports e
    set lease_token = gen_random_uuid(), lease_until = now() + interval '10 minutes', claimed_revision = r.revision
    from ready r where (e.user_id, e.session_key) = (r.user_id, r.session_key)
    returning r.user_id, r.session_key, r.spreadsheet_id, r.sheet_row, r.revision, r.workout, e.lease_token, r.exercise_names
$$;

create function public.finish_block_workout_export(
    p_user_id uuid, p_session_key text, p_revision integer, p_lease_token uuid, p_success boolean
) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
    update public.block_workout_exports e
    set delivered_revision = case when p_success then p_revision else e.delivered_revision end,
        lease_token = null, lease_until = null, claimed_revision = null,
        available_at = case when p_success then now()
            else now() + make_interval(secs => least(3600, 5 * (1 << least(10, e.failures)))) end,
        failures = case when p_success then 0 else least(10, e.failures + 1) end
    where (e.user_id, e.session_key) = (p_user_id, p_session_key)
        and e.lease_token = p_lease_token and e.claimed_revision = p_revision;
    return found;
end;
$$;
revoke all on function public.claim_block_workout_exports(integer),
    public.finish_block_workout_export(uuid,text,integer,uuid,boolean) from public, anon, authenticated;
grant execute on function public.claim_block_workout_exports(integer),
    public.finish_block_workout_export(uuid,text,integer,uuid,boolean) to service_role;

-- When the coach assigns a different replica, send the current versions to their stable rows.
create function public.retarget_block_exports() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
    update public.block_workout_exports set delivered_revision = 0, lease_token = null,
        lease_until = null, claimed_revision = null, available_at = now(), failures = 0
    where user_id = new.user_id;
    return new;
end;
$$;
revoke all on function public.retarget_block_exports() from public, anon, authenticated;
create trigger block_plan_replica_changed after update of spreadsheet_id on public.block_plans
    for each row when (old.spreadsheet_id is distinct from new.spreadsheet_id)
    execute function public.retarget_block_exports();
