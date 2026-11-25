-- Ejecutar después de desplegar la función y guardar ambos secretos en Vault.
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
    if (select count(*) from vault.decrypted_secrets
        where name in ('block_export_project_url', 'block_export_cron_secret') and length(decrypted_secret) > 0) <> 2
    then raise exception 'Faltan block_export_project_url o block_export_cron_secret en Vault.';
    end if;
end $$;

select cron.schedule('sync-block-workouts', '* * * * *', $job$
    select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'block_export_project_url')
               || '/functions/v1/sync-block-workouts',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret',
                    (select decrypted_secret from vault.decrypted_secrets where name = 'block_export_cron_secret')),
        body := '{}'::jsonb,
        timeout_milliseconds := 110000
    )
    where exists (
        select 1 from public.block_sheet_scans s join public.block_plans p using (user_id)
        where p.spreadsheet_id is not null and (s.lease_until is null or s.lease_until <= now())
          and (s.available_at <= now() or (s.failures = 0 and exists (
              select from public.block_workout_exports e join public.block_workouts w using (user_id, session_key)
              where e.user_id = s.user_id and e.available_at <= now() and w.revision > e.delivered_revision
                and not exists(select from public.block_sheet_conflicts c where c.user_id=e.user_id
                    and (c.session_key in ('',e.session_key) or c.sheet_row=w.sheet_row))
          )))
    );
$job$);
