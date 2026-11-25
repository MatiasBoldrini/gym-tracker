-- A converted sheet no longer depends on the former login, including if that account is removed.
create function public.detach_block_login() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
    update public.block_plans set auth_user_id = null where plan_id = new.plan_id and auth_user_id is not null;
    return new;
end;
$$;
revoke all on function public.detach_block_login() from public, anon, authenticated;
create trigger block_link_detaches_login after insert on public.block_plan_links for each row execute function public.detach_block_login();
update public.block_plans p set auth_user_id = null
where p.auth_user_id is not null and exists(select from public.block_plan_links l where l.plan_id=p.plan_id);

-- Keep direct legacy account assignments functional. The sheet manager generates an independent UUID.
create function public.recognize_block_login() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
    if new.auth_user_id is null and exists(select from auth.users u where u.id = new.user_id) then
        new.auth_user_id := new.user_id;
    end if;
    return new;
end;
$$;
revoke all on function public.recognize_block_login() from public, anon, authenticated;
create trigger block_plan_account_assignment before insert on public.block_plans for each row execute function public.recognize_block_login();

alter policy read_own_plan on public.block_plans using (auth_user_id = (select auth.uid()));
alter policy read_own_workouts on public.block_workouts using (
    user_id = (select auth.uid()) and exists (select from public.block_plans p where p.plan_id=block_workouts.plan_id and p.auth_user_id=(select auth.uid()))
);
alter policy read_own_sheet_conflicts on public.block_sheet_conflicts using (
    user_id = (select auth.uid()) and exists (select from public.block_plans p where p.plan_id=block_sheet_conflicts.plan_id and p.auth_user_id=(select auth.uid()))
);

create or replace function public.save_block_workout(p_session_key text, p_workout jsonb, p_expected_revision integer, p_plan_id uuid default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare athlete uuid;
begin
    select user_id into athlete from public.block_plans where auth_user_id=auth.uid() and user_id=auth.uid() for update;
    if not found then raise exception 'Usá el enlace de la hoja' using errcode = '42501'; end if;
    return public.store_block_workout(athlete,p_session_key,p_workout,p_expected_revision,p_plan_id,null);
end;
$$;
