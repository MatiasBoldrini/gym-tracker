# Sincronización de entrenamientos con Sheets

El entrenamiento queda guardado en PostgreSQL cuando la app recibe la revisión de `save_block_workout`. En esa misma transacción se agenda su entrega a la hoja asignada en `block_plans.spreadsheet_id`. Cada atleta tiene su propia hoja de destino. El propietario configura una sola identidad de Google con acceso de editor a esas hojas.

## Ejecución en Supabase

1. Aplicá las migraciones 004 y 005 y asigná el ID de la planilla de destino al atleta.
2. En los secretos de Edge Functions configurá `BLOCK_EXPORT_CRON_SECRET` con un valor aleatorio, y `GOOGLE_SERVICE_ACCOUNT_JSON` con el JSON de la cuenta de servicio. También se admite OAuth del propietario con `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` y `GOOGLE_REFRESH_TOKEN` con alcance `https://www.googleapis.com/auth/spreadsheets`. La función toma la clave administrativa de Supabase de su propio entorno.
3. Desde el directorio interno `gym-tracker/`, ejecutá `supabase functions deploy sync-block-workouts --no-verify-jwt`. La función autentica el POST con la cabecera privada `x-cron-secret`.
4. Guardá en Supabase Vault `block_export_project_url`, con la URL HTTPS del proyecto sin barra final, y `block_export_cron_secret`, con el mismo valor generado en el segundo paso. Ejecutá [schedule-block-export.sql](schedule-block-export.sql) en esa base. El trabajo `sync-block-workouts` revisa cada minuto si hay una hoja asignada que corresponda leer o registros pendientes. La función toma las hojas por turnos, incorpora cambios de Sheets y publica las revisiones pendientes del mismo atleta. El token de cron sólo permite disparar una pasada de exportación. [Programación de Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions)

## Verificación

El cron se ejecuta cada minuto. Una hoja que acaba de leerse vuelve a estar disponible un minuto después, así que una edición hecha directamente en Sheets suele llegar a PostgreSQL en uno o dos minutos. La app abierta consulta las revisiones cada 30 segundos y también al volver al primer plano. Los reintentos por errores de red o de Google pueden alargar esos tiempos.

Registrá una serie con una cuenta de prueba. En la pestaña **Registro app** aparecen el inicio de la sesión, las series, las notas y la revisión. Editá el peso y comprobá que cambia en la misma fila. La programación se lee de las pestañas de bloque. Su fila de nota y calificación también puede reflejar la sesión registrada; las fórmulas de esas celdas están protegidas frente a escrituras de la app. Las columnas desde J guardan el JSON íntegro por fragmentos para permitir reconstruir también las sesiones grandes.

### Edición en Sheets

- En **Registro app**, editá el inicio, el fin, las estrellas, las series o la nota de la fila. Las fechas admiten el formato de fecha de la planilla o ISO con zona horaria. En series, una línea como `Banca: ✓ 5 × 80 kg / ○ 5 × 85 kg` indica la primera serie completada y la segunda pendiente.
- Para cargar un entrenamiento nuevo, usá una fila vacía con el nombre o ID del bloque, la semana y el día que aparecen en la rutina. El escaneo valida esa combinación contra el plan.
- Las notas y calificaciones del bloque también se comparan con las de la sesión. Si la app y la hoja editaron campos distintos, se conservan ambos. Si editaron el mismo dato con valores distintos, consultá la nota en la celda de **Revisión**. Corregí la fila o escribí `usar app` o `usar hoja` ahí para elegir qué valor conservar. Al cambiar una sesión de día, cargala en la fila que corresponde a ese día.
- Las columnas ocultas guardan la última revisión y los valores para conciliar ediciones. Un cambio de la hoja que llega mientras se publica la fila se compara durante la siguiente lectura.

Desde el SQL Editor, consultá los pendientes y la fecha del próximo intento con permisos de administrador.

```sql
select w.user_id, w.session_key, w.revision, e.delivered_revision, e.failures, e.available_at
from public.block_workouts w
join public.block_workout_exports e using (user_id, session_key)
where w.revision > e.delivered_revision;
```

Un rechazo de Google mantiene la revisión pendiente. Consultá los logs de la función, revisá que la cuenta tenga acceso de editor y que la API de Sheets esté habilitada en su proyecto. Una respuesta perdida después de escribir se recupera por la revisión marcada en Sheets. Los rangos nombrados `Gym_Registro_…` y los metadatos de la pestaña forman parte de esa verificación.

## Ejecución local

Si usás un certificado de cuenta de servicio con vencimiento, registrá la clave pública de reemplazo antes de esa fecha. Actualizá el secreto de la función y la credencial local del administrador, comprobá ambos sentidos en una hoja de prueba y después revocá la clave anterior.

En el entorno del proceso configurá `SUPABASE_URL` y `SUPABASE_SECRET_KEY` del servidor. Para Google configurá `GOOGLE_APPLICATION_CREDENTIALS` con la ruta de las credenciales de aplicación o las tres variables OAuth anteriores. `npm run sync:blocks` revisa las hojas que están listas y procesa las entregas pendientes. `npm run sync:blocks -- --watch` sigue consultando y reintenta si hay cortes. `npm run test:block-export` ejercita los casos de concurrencia y recuperación con dobles de prueba.
