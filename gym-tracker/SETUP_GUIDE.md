# Configuración de Gym Tracker

## Arranque local

Ejecutá estos comandos desde el directorio interno `gym-tracker/`, que contiene `package.json`, `api-src/` y `apps/`. Usá Node 22.12 o posterior.

```sh
npm ci
npm --prefix apps/web ci
VITE_DEMO_MODE=true npm run dev
```

Abrí la URL que imprime Vite, normalmente `http://localhost:5173`. El modo demo trae datos de ejemplo. `npm run dev` y `npm run start` arrancan Vite y la vista previa estática respectivamente. El flujo OAuth y las rutas `/api/*` requieren el runtime de Vercel configurado en el mismo origen.

```sh
npm run lint
npm run build
```

El build crea la función de Node.js 24 en `.vercel/output/functions/` y el frontend en `apps/web/dist/`. El comando de `vercel.json` copia el frontend a `.vercel/output/static/`. En Vercel, la raíz del proyecto es el directorio interno `gym-tracker/`.

## Compartir una rutina v4

Creá o copiá una hoja v4. Dale edición a la persona que va a entrenar y a la cuenta de servicio de Google que usa el sincronizador. En tu Mac, abrí **Asignar rutina.command**, pegá el enlace de Google Sheets y enviá el enlace de la app que el programa copia. Podés volver a obtener el mismo enlace desde otra computadora autorizada. Quien lo tenga puede leer y registrar entrenamientos en esa rutina. El permiso en Drive y el acceso por enlace a la app se administran por separado.

Desde la terminal también podés administrar los enlaces.

```sh
npm run hoja -- abrir 'https://docs.google.com/spreadsheets/d/<ID>/edit'
npm run hoja -- renovar 'https://docs.google.com/spreadsheets/d/<ID>/edit'
npm run hoja -- revocar 'https://docs.google.com/spreadsheets/d/<ID>/edit'
```

Al renovar, compartí el nuevo enlace con quien deba seguir entrenando. Revocar el enlace conserva el historial y la sincronización de la hoja. Para una hoja nueva, el programa valida la estructura v4 antes de asignarla. La migración 006 conserva las asignaciones anteriores. Para copiar una hoja que ya tiene una pestaña de registro administrada, usá una plantilla limpia sin la pestaña **Registro app** ni sus rangos de sincronización.

### Configuración del administrador

Aplicá las migraciones con `supabase db push` y configurá el sincronizador. En el directorio interno guardá `GYM_APP_ORIGIN=https://<tu-app>` en `.env.admin.local`. El programa usa el proyecto vinculado a la CLI de Supabase, o bien `SUPABASE_URL` y `SUPABASE_SECRET_KEY` del entorno. Para leer hojas nuevas usa las credenciales de Google del sincronizador. En macOS admite la entrada **Gym Tracker v4 · Google Sheets** del llavero. El frontend sólo necesita `VITE_BLOCKS_CLOUD=true`, `VITE_SUPABASE_URL` y la clave publicable `VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY`.

Los enlaces son reutilizables y se recuperan con permisos administrativos desde Supabase Vault. Las lecturas y los guardados comprueban su huella por plan y respetan las políticas de filas. El fragmento del enlace se retira de la barra al abrirlo. Para reabrir completamente sin red, la PWA tiene que haber cargado con el enlace válido en HTTPS o localhost. Un dispositivo que ya descargó datos puede consultarlos sin conexión hasta que vuelva a comprobar su acceso. [Sincronización con Google Sheets](supabase/ops/README.md) · [Funcionamiento de la PWA](apps/web/README.md)

### Actualizar la app publicada

La dirección de producción es `https://gym-tracker-hojas.vercel.app`. Usá ese valor para `GYM_APP_ORIGIN`. Las actualizaciones del frontend conservan los enlaces privados ya asignados. El proyecto gratuito de Vercel sirve los archivos compilados y Supabase ejecuta la sincronización con Sheets.

Guardá las tres variables de frontend indicadas arriba en `apps/web/.env.local`. Ejecutá estos comandos desde el directorio interno.

```sh
VITE_BLOCKS_CLOUD=true npm --prefix apps/web run build
publicacion=$(mktemp -d)
mkdir -p "$publicacion/.vercel/output"
cp apps/web/vercel-output.json "$publicacion/.vercel/output/config.json"
cp -R apps/web/dist "$publicacion/.vercel/output/static"
vercel link --cwd "$publicacion" --project gym-tracker-hojas --scope matis-projects-b35aec9e --yes
vercel deploy --cwd "$publicacion" --scope matis-projects-b35aec9e --prebuilt --prod
```

## Integración de Google y Supabase para la versión con OAuth

1. Usá un proyecto Supabase de prueba. Aplicá `001_user_integrations.sql`, `002_user_preferences.sql` y `003_onboarding_progress.sql`, en ese orden, dentro de `supabase/migrations/`. Para conocer qué se aplicó, consultá el historial de migraciones del proyecto. Las políticas y triggers de `001` y `002` fallan si ya existen.
2. Habilitá Sheets API y Drive API en el proyecto Google Cloud. Creá un cliente OAuth de tipo web y registrá como redirección de Google `https://<proyecto>.supabase.co/auth/v1/callback`. Configurá esas credenciales en el proveedor Google de Supabase.
3. Agregá la URL de la app terminada en `/auth/callback` a los destinos permitidos de Supabase. Los scopes que pide el frontend están en `apps/web/src/lib/supabase/client.ts` y son `spreadsheets`, `drive.readonly` y `drive.file`.
4. Para provisionar rutinas de prueba, usá una plantilla dedicada compatible con `Semana 1`, `Ejercicios` y `Series`. El progreso también lee `RM` y la fatiga puede leer `Fatiga`. Podés consultar la [plantilla histórica](https://docs.google.com/spreadsheets/d/1XMFq-Twxtoa_Fs2_6kOWjB65mMqEgzFJ8ujzyZN7iCo/edit).
5. Configurá las variables de frontend y API y verificá login → callback → provisión → escritura en una copia de prueba. Un primer login guarda la integración y la app inicia la provisión de Sheets cuando detecta que quedó pendiente.

## Variables de entorno

En desarrollo, Vite lee sus valores de `apps/web/.env.local` o del entorno del proceso. Para un despliegue configurá las variables de ambos grupos en el entorno correspondiente de Vercel.

| Consumidor | Variable | Valor |
| --- | --- | --- |
| Frontend | `VITE_SUPABASE_URL` | URL del proyecto Supabase. |
| Frontend | `VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY` | Clave publicable de Supabase. |
| Frontend | `VITE_DEMO_MODE` | `true` para usar los datos de ejemplo. |
| API | `NEXT_PUBLIC_SUPABASE_URL` | La misma URL de Supabase. El nombre histórico sigue en uso en la API. |
| API | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` | La misma clave publicable de Supabase. |
| API | `GOOGLE_CLIENT_ID` | Identificador del cliente OAuth. |
| API | `GOOGLE_CLIENT_SECRET` | Secreto del cliente OAuth. |
| API | `GOOGLE_REDIRECT_URI` | Redirección opcional para el cliente Google del servidor. |
| API | `TOKEN_ENCRYPTION_KEY` | Clave estable de al menos 32 caracteres. Generá una con `openssl rand -base64 32`. Los tokens ya cifrados dependen de la clave con que se guardaron. |
| API | `SHEETS_TEMPLATE_ID` | ID de la plantilla para nuevas integraciones. El código tiene un ID histórico por defecto. |

Guardá secretos únicamente en el entorno de la API. El SDK de Supabase inicia y conserva la sesión en el cliente. El frontend envía su token de acceso mediante `Authorization` a Hono. La API almacena cifrado el refresh token de Google en `user_integrations`.

## Diagnóstico

- Si Vite devuelve HTML al consultar `/api/*`, verificá primero que el frontend esté conectado a un runtime que sirva Hono.
- `GET /api/auth/ping` verifica el enrutamiento de la API sin consultar Supabase.
- Si falla la redirección OAuth, revisá ambos destinos, el callback de Supabase registrado en Google y el callback de la app permitido en Supabase.
- Si el callback falla al guardar la integración, revisá la clave de cifrado, la disponibilidad del refresh token y la migración `001`. Si falla la carga de preferencias, revisá también `002` y `003`.
- Si falla la copia de la plantilla, revisá `SHEETS_TEMPLATE_ID`, el acceso de la cuenta de prueba y los scopes de Drive.
