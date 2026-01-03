# Guía de Configuración - Gym Tracker

## 📋 Paso 1: Configurar Google OAuth

### 1.1 Crear un proyecto en Google Cloud Console

1. Ve a [Google Cloud Console](https://console.cloud.google.com/)
2. Si no tenés cuenta, creá una (es gratis)
3. Click en el selector de proyectos (arriba a la izquierda) → **"Nuevo proyecto"**
4. Nombre: `gym-tracker` (o el que prefieras)
5. Click **"Crear"** y esperá unos segundos

### 1.2 Habilitar Google Sheets API

1. En el menú lateral izquierdo, buscá **"APIs y servicios"** → **"Biblioteca"**
2. Buscá **"Google Sheets API"**
3. Click en el resultado y luego en **"Habilitar"**
4. Esperá a que se habilite (aparece un check verde)

### 1.3 Configurar pantalla de consentimiento OAuth

1. En el menú lateral: **"APIs y servicios"** → **"Pantalla de consentimiento OAuth"**
2. Seleccioná **"Externo"** (si querés que cualquiera use la app) o **"Interno"** (solo tu organización)
   - **Nota**: Para "Externo" eventualmente necesitarás verificación, pero podés empezar en modo "Testing"
3. Click **"Crear"**
4. Completá:
   - **Nombre de la app**: `Gym Tracker`
   - **Email de soporte**: tu email
   - **Logo** (opcional): podés subir uno después
   - **Dominio autorizado** (opcional por ahora)
5. Click **"Guardar y continuar"**
6. En **"Scopes"**:
   - Click **"Agregar o quitar scopes"**
   - Buscá y seleccioná: `https://www.googleapis.com/auth/spreadsheets`
   - Click **"Actualizar"** → **"Guardar y continuar"**
7. En **"Usuarios de prueba"** (si elegiste "Externo"):
   - Agregá tu email (y los emails de quienes quieras que prueben sin verificación)
   - Click **"Guardar y continuar"**
8. Click **"Volver al panel"**

### 1.4 Crear credenciales OAuth

1. En el menú lateral: **"APIs y servicios"** → **"Credenciales"**
2. Click **"+ Crear credenciales"** → **"ID de cliente de OAuth"**
3. Si te pide configurar la pantalla de consentimiento primero, seguí los pasos anteriores
4. En **"Tipo de aplicación"**: seleccioná **"Aplicación web"**
5. Nombre: `Gym Tracker Web Client`
6. **URIs de redirección autorizados**:
   - Para desarrollo local: `http://localhost:3000/api/auth/google/callback`
   - Para producción (Vercel): `https://gym-tracker-hazel.vercel.app/api/auth/google/callback`
   - Agregá ambas (click **"+ Agregar URI"** para cada una)
7. Click **"Crear"**
8. **¡IMPORTANTE!** Copiá estos dos valores (los vas a necesitar):
   - **ID de cliente**: algo como `123456789-abc.apps.googleusercontent.com`
   - **Secreto de cliente**: algo como `GOCSPX-xxxxxxxxxxxxx`
   - ⚠️ El secreto solo se muestra UNA VEZ. Si lo perdés, tenés que crear otra credencial.

### 1.5 Obtener el ID de tu plantilla de Google Sheets (opcional)

1. Abrí tu Google Sheet de plantilla
2. En la URL, buscá el ID entre `/d/` y `/edit`:
   ```
   https://docs.google.com/spreadsheets/d/1XMFq-Twxtoa_Fs2_6kOWjB65mMqEgzFJ8ujzyZN7iCo/edit
                                                      ↑ Este es el ID ↑
   ```
3. Copiá ese ID (lo vas a usar como `NEXT_PUBLIC_SHEETS_TEMPLATE_ID`)

---

## 📋 Paso 2: Storage / DB

Esta versión del proyecto **NO usa KV/Redis/DB**. Guardamos el `refresh_token` y el `spreadsheetId` en una **cookie HttpOnly cifrada**, así que no necesitás configurar Storage en Vercel.

---

## 📋 Paso 3: Configurar variables de entorno

### 3.1 En Vercel (producción)

1. En tu proyecto de Vercel, andá a **"Settings"** → **"Environment Variables"**
2. Agregá estas variables (click **"Add"** para cada una):

```
GOOGLE_CLIENT_ID
Valor: [tu Client ID de Google, ej: 123456789-abc.apps.googleusercontent.com]

GOOGLE_CLIENT_SECRET
Valor: [tu Client Secret de Google, ej: GOCSPX-xxxxxxxxxxxxx]

GOOGLE_REDIRECT_URI
Valor: https://tu-app.vercel.app/api/auth/google/callback
(Reemplazá "tu-app" con el nombre real de tu deployment)

SESSION_SECRET
Valor: [generá un string random de 32+ caracteres]
Ejemplo: openssl rand -base64 32
O usá: https://generate-secret.vercel.app/32

TOKEN_ENCRYPTION_KEY
Valor: [otro string random de 32+ caracteres, diferente al anterior]
Ejemplo: openssl rand -base64 32

NEXT_PUBLIC_SHEETS_TEMPLATE_ID
Valor: [el ID de tu plantilla de Google Sheets, ej: 1XMFq-Twxtoa...]
```

3. Para cada variable, seleccioná los **entornos** donde aplica:

   - ✅ Production
   - ✅ Preview
   - ✅ Development (si querés probar en previews)

4. Click **"Save"** para cada una

### 3.2 En local (.env.local)

1. En la raíz de tu proyecto, creá un archivo `.env.local`
2. Copiá este contenido y reemplazá los valores:

```bash
# Google OAuth
GOOGLE_CLIENT_ID=tu_client_id_aqui.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=tu_client_secret_aqui
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback

# Seguridad
SESSION_SECRET=tu_session_secret_32_chars_minimo
TOKEN_ENCRYPTION_KEY=tu_encryption_key_32_chars_minimo

# Template (opcional)
NEXT_PUBLIC_SHEETS_TEMPLATE_ID=tu_template_id_aqui
```

3. Guardá el archivo

---

## 📋 Paso 4: Generar secrets seguros (opcional pero recomendado)

Si querés generar strings random seguros para `SESSION_SECRET` y `TOKEN_ENCRYPTION_KEY`:

### Opción A: Terminal (macOS/Linux)

```bash
# Generar SESSION_SECRET
openssl rand -base64 32

# Generar TOKEN_ENCRYPTION_KEY (otro diferente)
openssl rand -base64 32
```

### Opción B: Online

1. Ve a https://generate-secret.vercel.app/32
2. Generá dos strings diferentes (uno para cada variable)

---

## 📋 Paso 5: Verificar que todo funciona

### 5.1 Probar localmente

1. Reiniciá tu servidor de desarrollo:

   ```bash
   npm run dev
   ```

2. Abrí `http://localhost:3000`
3. Deberías ver el modal de setup
4. Click en **"Conectar con Google"**
5. Deberías ser redirigido a Google para autorizar
6. Después de autorizar, deberías volver a la app

### 5.2 Probar en Vercel

1. Hacé un commit y push a tu repo
2. Vercel debería hacer deploy automático
3. Una vez deployado, andá a tu URL de Vercel
4. Probá el flujo completo de autenticación

---

## ⚠️ Troubleshooting

### Error: "redirect_uri_mismatch"

- Verificá que agregaste EXACTAMENTE la misma URL en Google Cloud Console
- Para local: `http://localhost:3000/api/auth/google/callback`
- Para producción: `https://tu-app.vercel.app/api/auth/google/callback`

### Error: "app not verified" (pantalla de advertencia de Google)

- Esto es normal si elegiste "Externo" en la pantalla de consentimiento
- Podés continuar igual (click en "Avanzar")
- Para quitarlo, necesitás verificar la app con Google (proceso más largo)

### Error: "Not authenticated" / "No Google account linked"

- Volvé a hacer **Conectar con Google** (si borraste cookies o estás en otro dispositivo/navegador)

### Error: "SESSION_SECRET must be at least 32 characters"

- Asegurate de que tus secrets tengan al menos 32 caracteres
- Generá nuevos con `openssl rand -base64 32`

---

## 📝 Checklist final

- [ ] Proyecto creado en Google Cloud Console
- [ ] Google Sheets API habilitada
- [ ] Pantalla de consentimiento OAuth configurada
- [ ] Credenciales OAuth creadas (Client ID + Secret)
- [ ] Variables de entorno configuradas en Vercel
- [ ] Archivo `.env.local` creado localmente
- [ ] Secrets generados (SESSION_SECRET, TOKEN_ENCRYPTION_KEY)
- [ ] Probar flujo completo de autenticación

---

## 🎉 ¡Listo!

Una vez completados estos pasos, tu app debería estar funcionando con:

- ✅ Autenticación OAuth con Google
- ✅ Escritura a Google Sheets sin CORS
- ✅ Persistencia multi-usuario vía cookie HttpOnly cifrada (sin DB)
- ✅ Onboarding user-friendly

### Nombres de pestañas esperados (importante)

La app lee los datos por **título de pestaña** (no por gid). Asegurate de tener:

- `Semana 1`, `Semana 2`, ... (solo aparecen en el selector las que existan)
- `RM` (PRs)
- `Ejercicios` (mapeo nombre→imagen)
- `Fatiga` (tabla de volumen semanal)

Si tenés algún problema, revisá los logs en Vercel o en la consola del navegador.
