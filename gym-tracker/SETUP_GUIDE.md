# Guía de Configuración - Gym Tracker

## 📋 Paso 1: Crear proyecto en Supabase

### 1.1 Crear cuenta y proyecto

1. Ve a [Supabase](https://supabase.com/) y creá una cuenta (es gratis)
2. Click en **"New project"**
3. Nombre: `gym-tracker` (o el que prefieras)
4. Database password: generá una segura y guardala
5. Región: elegí la más cercana a tus usuarios
6. Click **"Create new project"** y esperá ~2 minutos

### 1.2 Obtener credenciales de Supabase

1. En el dashboard de tu proyecto, andá a **Settings** → **API**
2. Copiá estos valores (los vas a necesitar):
   - **Project URL**: algo como `https://xxxx.supabase.co`
   - **Publishable key** (antes llamada "anon key"): el JWT que empieza con `eyJ...`

### 1.3 Ejecutar migración de base de datos

1. En Supabase, andá a **SQL Editor** → **New Query**
2. Copiá y pegá el contenido del archivo `supabase/migrations/001_user_integrations.sql`
3. Click **"Run"** para crear la tabla y las políticas RLS

---

## 📋 Paso 2: Configurar Google OAuth en Supabase

### 2.1 Crear credenciales en Google Cloud Console

1. Ve a [Google Cloud Console](https://console.cloud.google.com/)
2. Creá un proyecto nuevo o usá uno existente
3. Habilitá las APIs:
   - **Google Sheets API**
   - **Google Drive API**
4. Andá a **APIs y servicios** → **Credenciales** → **+ Crear credenciales** → **ID de cliente de OAuth**
5. Tipo de aplicación: **Aplicación web**
6. Nombre: `Gym Tracker`
7. **URIs de redirección autorizados**:
   - `https://TU_PROJECT_ID.supabase.co/auth/v1/callback`
   - (Reemplazá `TU_PROJECT_ID` con tu project ID de Supabase)
8. Copiá el **Client ID** y **Client Secret**

### 2.2 Configurar Google como provider en Supabase

1. En Supabase, andá a **Authentication** → **Providers**
2. Buscá **Google** y habilitalo
3. Pegá tu **Client ID** y **Client Secret** de Google
4. En **Authorized Client IDs**, dejalo vacío o agregá tu Client ID
5. Click **"Save"**

### 2.3 Configurar pantalla de consentimiento OAuth (Google)

1. En Google Cloud Console, andá a **APIs y servicios** → **Pantalla de consentimiento OAuth**
2. Seleccioná **Externo** (o **Interno** si es solo para tu organización)
3. Completá los datos básicos (nombre, email de soporte)
4. En **Scopes**, agregá:
   - `https://www.googleapis.com/auth/spreadsheets`
   - `https://www.googleapis.com/auth/drive.file`
5. En **Usuarios de prueba** (si elegiste Externo), agregá los emails de quienes van a probar

---

## 📋 Paso 3: Preparar la plantilla de Google Sheets

1. Usá la plantilla oficial o creá la tuya:

   - **Plantilla oficial**: `1XMFq-Twxtoa_Fs2_6kOWjB65mMqEgzFJ8ujzyZN7iCo`
   - [Ver plantilla](https://docs.google.com/spreadsheets/d/1XMFq-Twxtoa_Fs2_6kOWjB65mMqEgzFJ8ujzyZN7iCo/edit?usp=sharing)

2. **Importante**: La plantilla debe estar compartida con permisos de **"Cualquiera con el link puede ver"** para que los usuarios puedan copiarla.

3. En la URL de tu plantilla, buscá el ID entre `/d/` y `/edit`:
   ```
   https://docs.google.com/spreadsheets/d/1XMFq-Twxtoa_Fs2_6kOWjB65mMqEgzFJ8ujzyZN7iCo/edit
                                                      ↑ Este es el ID ↑
   ```

---

## 📋 Paso 4: Configurar variables de entorno

### 4.1 En Vercel (producción)

1. En tu proyecto de Vercel, andá a **Settings** → **Environment Variables**
2. Agregá estas variables:

```
NEXT_PUBLIC_SUPABASE_URL
Valor: [tu Project URL de Supabase, ej: https://xxxx.supabase.co]

NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY
Valor: [tu Publishable key de Supabase, ej: eyJ...]

GOOGLE_CLIENT_ID
Valor: [tu Client ID de Google, ej: 123456789-abc.apps.googleusercontent.com]

GOOGLE_CLIENT_SECRET
Valor: [tu Client Secret de Google, ej: GOCSPX-xxxxxxxxxxxxx]

TOKEN_ENCRYPTION_KEY
Valor: [string random de 32+ caracteres para cifrar refresh tokens]
Ejemplo: openssl rand -base64 32

SHEETS_TEMPLATE_ID
Valor: [el ID de tu plantilla de Google Sheets]
(Si no lo definís, se usa la plantilla oficial por defecto)
```

3. Para cada variable, seleccioná los **entornos** donde aplica (Production, Preview, Development)

### 4.2 En local (.env.local)

Creá un archivo `.env.local` en la raíz del proyecto:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://tu-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=eyJ...tu_publishable_key

# Google OAuth (para refresh de tokens)
GOOGLE_CLIENT_ID=tu_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=tu_client_secret

# Seguridad
TOKEN_ENCRYPTION_KEY=tu_encryption_key_32_chars_minimo

# Template (server-only)
SHEETS_TEMPLATE_ID=1XMFq-Twxtoa_Fs2_6kOWjB65mMqEgzFJ8ujzyZN7iCo
```

---

## 📋 Paso 5: Verificar que todo funciona

### 5.1 Probar localmente

1. Reiniciá tu servidor de desarrollo:

   ```bash
   npm run dev
   ```

2. Abrí `http://localhost:3000`
3. Deberías ver el botón "Conectar con Google"
4. Al hacer click, Supabase te redirige a Google para autorizar
5. Después de autorizar:
   - Se crea automáticamente una copia de la plantilla en tu Drive
   - El `spreadsheetId` y `refreshToken` se guardan en la BD de Supabase
6. Serás redirigido a la app ya funcionando

### 5.2 Probar en Vercel

1. Hacé un commit y push a tu repo
2. Vercel debería hacer deploy automático
3. Probá el flujo completo de autenticación

---

## ⚠️ Troubleshooting

### Error: "redirect_uri_mismatch"

- Verificá que en Google Cloud Console tengas configurado el redirect URI correcto:
  `https://TU_PROJECT_ID.supabase.co/auth/v1/callback`

### Error: "No provider_refresh_token received"

- Asegurate de que los scopes de Drive/Sheets estén configurados en tu app
- Verificá que `access_type: offline` y `prompt: consent` estén seteados

### Error: "Failed to create spreadsheet"

- Verificá que la plantilla esté compartida con "Cualquiera con el link puede ver"
- Verificá que habilitaste las APIs de Drive y Sheets en Google Cloud

### El usuario no ve su spreadsheet en otro dispositivo

- Eso no debería pasar más: el `spreadsheetId` se guarda en Supabase y se reutiliza
- Si pasa, verificá que la tabla `user_integrations` tenga el dato

---

## 📝 Arquitectura

### Flujo de autenticación

```
Usuario → "Conectar con Google" → Supabase OAuth → Google consent
                                                         ↓
                                         Supabase recibe tokens
                                                         ↓
                                         Redirect a /auth/callback
                                                         ↓
                                    - Guarda refresh_token cifrado en BD
                                    - Crea spreadsheet si no existe
                                    - Guarda spreadsheetId en BD
                                                         ↓
                                              Redirect a home
```

### Modelo de datos

Tabla `user_integrations` en Supabase:

- `user_id`: UUID (PK, referencia a auth.users)
- `email`: texto
- `spreadsheet_id`: ID del Google Sheet del usuario
- `google_refresh_token_enc`: refresh token cifrado (AES-GCM)
- `created_at`, `updated_at`: timestamps

### Seguridad

- Los refresh tokens se cifran con AES-GCM antes de guardarse en BD
- RLS (Row Level Security) asegura que cada usuario solo accede a sus datos
- Las cookies de sesión son manejadas por Supabase (HttpOnly, Secure)

---

## 📝 Checklist final

- [ ] Proyecto creado en Supabase
- [ ] Migración SQL ejecutada (tabla `user_integrations`)
- [ ] Google OAuth configurado en Supabase
- [ ] APIs de Sheets y Drive habilitadas en Google Cloud
- [ ] Credenciales OAuth creadas en Google Cloud
- [ ] Variables de entorno configuradas (Vercel y local)
- [ ] Plantilla compartida con "Cualquiera con el link puede ver"
- [ ] Probar flujo completo de login → crear spreadsheet → usar app

---

## 🎉 ¡Listo!

Una vez completados estos pasos, tu app debería estar funcionando con:

- ✅ Autenticación gestionada por Supabase
- ✅ Usuarios y spreadsheets persistidos en BD
- ✅ Creación automática de spreadsheet en el primer login
- ✅ Multi-dispositivo: el usuario encuentra su spreadsheet en cualquier device
- ✅ Refresh tokens cifrados y seguros

### Nombres de pestañas esperados

La app lee los datos por **título de pestaña**. Asegurate de que la plantilla tenga:

- `Semana 1`, `Semana 2`, ... (las que existan)
- `RM` o `RM A,B,C` (PRs)
- `Ejercicios` (mapeo nombre→imagen)
- `Fatiga` (tabla de volumen semanal)
