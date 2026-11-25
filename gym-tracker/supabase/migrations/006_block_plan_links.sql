create extension if not exists supabase_vault with schema vault;
create extension if not exists pgcrypto with schema extensions;

-- Existing account assignments retain their lifecycle. New sheet assignments need only an internal UUID.
alter table public.block_plans add column auth_user_id uuid references auth.users(id) on delete cascade;
update public.block_plans set auth_user_id = user_id;
alter table public.block_plans drop constraint block_plans_user_id_fkey,
    alter column user_id set default gen_random_uuid(),
    add constraint block_plans_auth_owner check (auth_user_id is null or auth_user_id = user_id);

create table public.block_plan_links (
    plan_id uuid primary key references public.block_plans(plan_id) on delete cascade,
    spreadsheet_id text not null,
    vault_id uuid not null unique,
    token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$')
);
alter table public.block_plan_links enable row level security;
revoke all on public.block_plan_links from public, anon, authenticated, service_role;


-- Only the owner's admin program can retrieve or rotate a share link. The Data API
-- checks the digest on reads and writes and never needs to decrypt a credential.
create function public.manage_block_plan_link(p_sheet text, p_action text)
returns text language plpgsql security definer set search_path = '' as $$
declare
    assigned uuid;
    link public.block_plan_links%rowtype;
    secret text;
    secret_id uuid;
begin
    if p_action is null or p_action not in ('open', 'rotate', 'revoke') then
        raise exception 'Operación de enlace desconocida' using errcode = '22023';
    end if;
    select plan_id into strict assigned from public.block_plans where spreadsheet_id = p_sheet for update;
    select * into link from public.block_plan_links where plan_id = assigned;
    if p_action = 'revoke' then
        delete from public.block_plan_links where plan_id = assigned;
        return null;
    end if;
    if link.plan_id is not null and p_action = 'open' then
        select decrypted_secret into strict secret from vault.decrypted_secrets where id = link.vault_id;
        return secret;
    end if;
    secret := encode(extensions.gen_random_bytes(32), 'hex');
    if link.plan_id is null then
        secret_id := vault.create_secret(secret);
        insert into public.block_plan_links(plan_id, spreadsheet_id, vault_id, token_hash)
            values (assigned, p_sheet, secret_id, encode(sha256(convert_to(secret,'UTF8')), 'hex'));
    else
        perform vault.update_secret(link.vault_id,secret);
        update public.block_plan_links set token_hash = encode(sha256(convert_to(secret,'UTF8')), 'hex') where plan_id = assigned;
    end if;
    return secret;
end;
$$;
revoke all on function public.manage_block_plan_link(text,text) from public, anon, authenticated;
grant execute on function public.manage_block_plan_link(text,text) to service_role;

create function public.remove_block_link_secret() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
    delete from vault.secrets where id = old.vault_id;
    return old;
end;
$$;
revoke all on function public.remove_block_link_secret() from public, anon, authenticated;
create trigger block_link_removed after delete on public.block_plan_links for each row execute function public.remove_block_link_secret();

create function public.invalidate_block_plan_link() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
    delete from public.block_plan_links where plan_id = old.plan_id;
    return new;
end;
$$;
revoke all on function public.invalidate_block_plan_link() from public, anon, authenticated;
create trigger block_plan_link_reassigned before update of spreadsheet_id, plan_id on public.block_plans
    for each row when ((old.spreadsheet_id, old.plan_id) is distinct from (new.spreadsheet_id, new.plan_id))
    execute function public.invalidate_block_plan_link();

-- PostgREST sets request.headers for the current transaction. Only the digest is stored.
create function public.linked_block_plan_id() returns uuid
language sql stable security definer set search_path = '' as $$
    select l.plan_id from public.block_plan_links l
    join public.block_plans p using (plan_id, spreadsheet_id)
    where l.token_hash = encode(sha256(convert_to(
        nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-gym-routine', 'UTF8')), 'hex')
$$;
revoke all on function public.linked_block_plan_id() from public, anon, authenticated;
grant execute on function public.linked_block_plan_id() to anon;

create policy read_linked_plan on public.block_plans for select to anon
    using (plan_id = (select public.linked_block_plan_id()));
create policy read_linked_workouts on public.block_workouts for select to anon
    using (plan_id = (select public.linked_block_plan_id()));
create policy read_linked_conflicts on public.block_sheet_conflicts for select to anon
    using (plan_id = (select public.linked_block_plan_id()));
grant select (user_id, plan_id, routine, plan_revision) on public.block_plans to anon;
grant select (user_id, plan_id, session_key, revision, workout) on public.block_workouts to anon;
grant select (user_id, plan_id, session_key, sheet_row, reason) on public.block_sheet_conflicts to anon;

create function public.save_linked_block_workout(p_session_key text, p_workout jsonb, p_expected_revision integer, p_plan_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare athlete uuid;
begin
    -- Use the same lock order as a reassignment. Concurrent revocation and save have a defined order.
    select p.user_id into athlete from public.block_plans p
    where p.plan_id = p_plan_id and p.plan_id = public.linked_block_plan_id() for update;
    if not found then raise exception 'Enlace de rutina inválido' using errcode = '42501'; end if;
    perform 1 from public.block_plan_links l where l.plan_id = p_plan_id and l.token_hash =
        encode(sha256(convert_to(nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-gym-routine','UTF8')),'hex') for share;
    if not found then raise exception 'Enlace de rutina inválido' using errcode = '42501'; end if;
    return public.store_block_workout(athlete, p_session_key, p_workout, p_expected_revision, p_plan_id, null);
end;
$$;
revoke all on function public.save_linked_block_workout(text,jsonb,integer,uuid) from public, anon, authenticated;
grant execute on function public.save_linked_block_workout(text,jsonb,integer,uuid) to anon;
