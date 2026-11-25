# 🏋️ Gym Tracker - Arquitectura de Network Requests & Caching

## Aplicación actual

- El frontend es una SPA de React y Vite con React Router. Consultá [el README de la web](apps/web/README.md) para arrancar y [la guía de entorno](SETUP_GUIDE.md) para activar la integración.
- `apps/web/src/lib/sheets-client.ts` llama a `/api/*`. En Vercel, `scripts/build-api.mjs` empaqueta `api-src/[[...path]].ts` como una función Hono. La capa `api-src/_lib/` se encarga de Supabase, Google y el parseo de las pestañas de rutina.
- `api-src/[[...path]].ts` responde con `Cache-Control: private, no-store` en autenticación, Sheets, preferencias y fatiga. La configuración PWA en `apps/web/vite.config.ts` usa `NetworkOnly` para la API del mismo origen. `apps/web/src/lib/pwa.ts` y `apps/web/src/components/PwaRegister.tsx` manejan el registro del service worker y la limpieza de cachés en el navegador.
- La vista `/bloques` usa un enlace privado por hoja para leer y escribir el historial v4 en Supabase. El worker sincroniza la planilla en ambos sentidos. El modo local admite una copia de desarrollo. Revisá la documentación de esa vista antes de cambiar los parsers de la plantilla `Semana N`.

---

> Los diagramas y tablas que siguen describen una versión histórica de Next.js. Se conservan como referencia del flujo anterior. Para consultar rutas, cachés y archivos vigentes, usá los enlaces y los puntos de entrada de la sección anterior.

## 📊 Diagrama General de Arquitectura

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                   CLIENTE (Browser)                               │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                   │
│  ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐            │
│  │   HomeScreen    │     │  RutinaEditor   │     │   FatigaScreen  │            │
│  │    (SSR+CSR)    │     │     (CSR)       │     │      (CSR)      │            │
│  └────────┬────────┘     └────────┬────────┘     └────────┬────────┘            │
│           │                       │                       │                      │
│           ▼                       ▼                       ▼                      │
│  ┌─────────────────────────────────────────────────────────────────────┐        │
│  │                        sheets-client.ts                              │        │
│  │  (Wrapper de fetch para todas las llamadas a /api/sheets/*)          │        │
│  └─────────────────────────────────────────────────────────────────────┘        │
│           │                                                                      │
│           ▼                                                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐        │
│  │                    🔧 SERVICE WORKER (PWA)                           │        │
│  │  ┌─────────────────────────────────────────────────────────────┐    │        │
│  │  │ Caché: next-static-assets | exercise-images | sheets-api    │    │        │
│  │  │ Estrategias: CacheFirst (imgs) | StaleWhileRevalidate (API) │    │        │
│  │  └─────────────────────────────────────────────────────────────┘    │        │
│  └─────────────────────────────────────────────────────────────────────┘        │
│                                                                                   │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        │ HTTP
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              SERVIDOR (Next.js API Routes)                        │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                   │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │                           /api/auth/*                                      │  │
│  │  ├── /me          → Estado de autenticación (GET)                         │  │
│  │  ├── /logout      → Cerrar sesión (POST)                                  │  │
│  │  └── /google/*    → OAuth flow                                            │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
│                                                                                   │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │                           /api/sheets/*                                    │  │
│  │  ├── /weeks       → Lista de semanas disponibles (GET)                    │  │
│  │  ├── /week        → Datos de una semana completa (GET)                    │  │
│  │  ├── /exercise    → Sets de un ejercicio específico (GET)                 │  │
│  │  ├── /exercises   → Lista de ejercicios disponibles (GET)                 │  │
│  │  ├── /series      → Opciones de series prescritas (GET)                   │  │
│  │  ├── /routine     → Rutina de un día (GET/POST)                           │  │
│  │  ├── /save        → Guardar sets de ejercicio (POST)                      │  │
│  │  └── /rating      → Guardar calificación de sesión (POST)                 │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
│                                                                                   │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │                           /api/fatiga                                      │  │
│  │  └── GET → Datos de fatiga muscular semanal                               │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
│                                                                                   │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        │ Google APIs
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              GOOGLE SHEETS API                                    │
│  └── spreadsheets.values.get/update                                              │
│  └── spreadsheets.get (para listar sheets)                                       │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 🔄 Flujo de Datos por Pantalla

### 1️⃣ **HOME (`/`)** - Pantalla Principal

```
┌─────────────────────────────────────────────────────────────────┐
│                    CARGA INICIAL (SSR)                          │
│  page.tsx ejecuta en servidor → getHomeData()                   │
│  ├── Supabase: getUser() + user_integrations                   │
│  ├── Google OAuth: refreshAccessToken()                         │
│  └── Google Sheets: 3 llamadas paralelas                        │
│      ├── listSpreadsheetSheetTitles() → detectar semanas       │
│      ├── readSheetValues('Semana X'!A:N) → datos de semana     │
│      └── readSheetValues('Ejercicios'!A:D) → mapping imágenes  │
│                                                                 │
│  RESULTADO: { initialWeek, initialPrs, initialSetupError }     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    HIDRATACIÓN (CSR)                            │
│  HomeScreen.tsx monta en cliente                                │
│                                                                 │
│  useEffect #1: fetchWeeksList()                                │
│  └── GET /api/sheets/weeks                                      │
│      └── → Cargar dropdown de semanas                          │
│                                                                 │
│  useEffect #2: fetchWeekData(selectedWeekId)                   │
│  └── GET /api/sheets/week?weekId=X                             │
│      └── → Actualizar cuando usuario cambia semana             │
│                                                                 │
│  useEffect #3: cacheUrls(urls)                                 │
│  └── postMessage al SW para pre-cachear imágenes de rutina     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    INTERACCIONES (CSR)                          │
│                                                                 │
│  📱 Click en ExerciseCard:                                      │
│  └── fetchExerciseSets({weekId, dayId, exerciseName})          │
│      └── GET /api/sheets/exercise?weekId=X&dayId=Y&name=Z      │
│                                                                 │
│  💾 Guardar series:                                             │
│  └── saveExerciseSets(weekId, dayId, exerciseName, sets)       │
│      └── POST /api/sheets/save                                 │
│                                                                 │
│  ⭐ Calificar sesión:                                           │
│  └── saveSessionRating(weekId, dayId, stars)                   │
│      └── POST /api/sheets/rating                               │
│                                                                 │
│  🔄 Info Popover (refresh sets del día):                       │
│  └── Promise.all(exercises.map(fetchExerciseSets))             │
│      └── N llamadas GET /api/sheets/exercise en paralelo       │
└─────────────────────────────────────────────────────────────────┘
```

---

### 2️⃣ **RUTINA (`/rutina`)** - Editor de Rutina

```
┌─────────────────────────────────────────────────────────────────┐
│                    CARGA INICIAL (CSR)                          │
│  RutinaEditorScreen.tsx - 100% client-side                      │
│                                                                 │
│  useEffect #1: Cargar datos iniciales                          │
│  └── Promise.all([                                              │
│        fetchExercisesList(),  // GET /api/sheets/exercises     │
│        fetchSeriesOptions()   // GET /api/sheets/series        │
│      ])                                                         │
│  └── Luego: cacheUrls(allExerciseImages) - precache SW         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    CAMBIO DE DÍA (CSR)                          │
│                                                                 │
│  useEffect: fetchDayRoutine(selectedDayId)                     │
│  └── GET /api/sheets/routine?dayId=X                           │
│      └── → Se dispara cada vez que cambia el día seleccionado │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    GUARDAR (CSR)                                │
│                                                                 │
│  handleAddExercise() / handleSave():                           │
│  └── saveRoutine(dayId, exercises)                             │
│      └── POST /api/sheets/routine                              │
└─────────────────────────────────────────────────────────────────┘
```

---

### 3️⃣ **PROGRESO (`/progreso`)** - Personal Records

```
┌─────────────────────────────────────────────────────────────────┐
│                    CARGA INICIAL (SSR)                          │
│  page.tsx ejecuta en servidor                                   │
│  ├── Supabase: getUser() + user_integrations                   │
│  ├── Google OAuth: refreshAccessToken()                         │
│  └── Google Sheets:                                             │
│      └── readSheetValues('RM A,B,C'!A:E) ó ('RM'!A:E)          │
│                                                                 │
│  RESULTADO: { initialPrs }                                     │
│  ⚠️ No hay llamadas client-side adicionales                    │
└─────────────────────────────────────────────────────────────────┘
```

---

### 4️⃣ **FATIGA (`/fatiga`)** - Mapa de Fatiga Muscular

```
┌─────────────────────────────────────────────────────────────────┐
│                    CARGA INICIAL (CSR)                          │
│  FatigaPage.tsx - "use client"                                  │
│                                                                 │
│  useEffect: loadFatiga()                                       │
│  └── GET /api/fatiga                                           │
│      └── Servidor lee 'Fatiga'!A:Z y computa intensidades      │
│                                                                 │
│  ⚠️ No hay más llamadas después de la carga inicial            │
└─────────────────────────────────────────────────────────────────┘
```

---

### 5️⃣ **AUTH** - Flujo de Autenticación

```
┌─────────────────────────────────────────────────────────────────┐
│                    ESTADO DE AUTH (CSR)                         │
│  useAuth() hook - usado en todas las pantallas                  │
│                                                                 │
│  useEffect: fetchAuthState()                                   │
│  └── GET /api/auth/me                                          │
│      └── Responde: { authenticated, hasSpreadsheet, email }   │
│                                                                 │
│  login():                                                       │
│  └── Supabase signInWithOAuth() → Google OAuth                 │
│  └── Callback: /auth/callback → guarda tokens en DB            │
│                                                                 │
│  logout():                                                      │
│  └── POST /api/auth/logout                                     │
│  └── Supabase signOut()                                        │
└─────────────────────────────────────────────────────────────────┘
```

---

## 💾 Estrategias de Caching (Service Worker / PWA)

### Configuración en `next.config.js`:

| Recurso | Estrategia | Cache Name | Max Entries | TTL |
|---------|------------|------------|-------------|-----|
| `/_next/static/*` | **CacheFirst** | `next-static-assets` | 100 | 1 año |
| `/images/exercises/*` | **CacheFirst** | `exercise-images` | 300 | 30 días |
| `/images/*` | **CacheFirst** | `static-images` | 50 | 30 días |
| `/api/sheets/*` (GET) | **StaleWhileRevalidate** | `sheets-api-cache` | 50 | 7 días |
| `/api/fatiga` (GET) | **StaleWhileRevalidate** | `fatiga-api-cache` | 10 | 7 días |
| `/api/bodymap` (GET) | **StaleWhileRevalidate** | `bodymap-api-cache` | 10 | 7 días |

### Comportamiento por estrategia:

```
┌─────────────────────────────────────────────────────────────────┐
│  CacheFirst (imágenes, assets estáticos)                        │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 1. ¿Está en caché? → Responder inmediatamente            │  │
│  │ 2. ¿No está? → Fetch de red, guardar en caché            │  │
│  │                                                          │  │
│  │ ✅ PROS: Máxima velocidad, funciona offline              │  │
│  │ ⚠️ CONS: Datos pueden quedar obsoletos hasta expirar     │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  StaleWhileRevalidate (APIs de datos)                           │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 1. ¿Está en caché? → Responder inmediatamente (stale)    │  │
│  │ 2. EN PARALELO: Fetch de red, actualizar caché           │  │
│  │ 3. Próxima request usará la versión actualizada          │  │
│  │                                                          │  │
│  │ ✅ PROS: UX rápida + datos eventualmente frescos         │  │
│  │ ⚠️ CONS: Primera vista puede mostrar datos viejos        │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Pre-caching selectivo de imágenes (`cacheUrls`):

```
┌─────────────────────────────────────────────────────────────────┐
│  pwa.ts → cacheUrls(urls: string[])                            │
│                                                                 │
│  1. Se llama cuando se carga la rutina de una semana           │
│  2. Extrae las URLs de imágenes de los ejercicios de la semana │
│  3. Envía postMessage al SW con type: "CACHE_URLS"             │
│  4. SW descarga y cachea las imágenes en background            │
│                                                                 │
│  ⚡ Optimización: NO precachea las 287 imágenes de ejercicios  │
│     Solo las que el usuario necesita para SU rutina actual     │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📈 Resumen de Requests por Pantalla

| Pantalla | SSR Requests | CSR Inicial | CSR Interacciones |
|----------|--------------|-------------|-------------------|
| **Home** | 3 (sheets) | 2 (weeks + week) | 1-N por click/save |
| **Rutina** | 0 | 2 (exercises + series) + 1 per day | 1 por guardar |
| **Progreso** | 1 (RM sheet) | 0 | 0 |
| **Fatiga** | 0 | 1 (/api/fatiga) | 0 |
| **Perfil** | 0 | 1 (/api/auth/me) | 1 logout |

---

## ⚠️ Puntos de Atención para Performance

### 1. **Home - Múltiples fetches de ejercicios**
```
Ubicación: HomeScreen.tsx líneas 259-323 (showInfoPopover effect)
Problema: Al abrir info popover, hace N llamadas paralelas a fetchExerciseSets
Recomendación: Considerar un endpoint batch /api/sheets/exercises-bulk
```

### 2. **No hay revalidación automática**
```
Problema: Los datos SSR de Home y Progreso no se actualizan sin refresh
Actual: Solo se actualizan al cambiar semana o recargar página
Posible mejora: SWR/React Query con revalidateOnFocus
```

### 3. **Rutina Editor - Carga todas las imágenes**
```
Ubicación: RutinaEditorScreen.tsx línea 82-85
Comportamiento: Pre-cachea TODAS las imágenes de ejercicios disponibles
Esto es intencional para que el modal de búsqueda funcione offline
```

### 4. **Sin debounce en guardado de series**
```
Ubicación: HomeScreen.tsx → handleSaveSeries
Cada cambio guarda inmediatamente (POST /api/sheets/save)
El usuario puede generar muchas requests rápidas
```

### 5. **Google API Rate Limits**
```
Todas las requests pasan por Google Sheets API
Límite: 60 requests/minuto por usuario
El SW con StaleWhileRevalidate ayuda a reducir requests redundantes
```

---

## 🔍 Árbol de Dependencias de Datos

```
Usuario autenticado
    │
    ├── user_integrations (Supabase)
    │   ├── spreadsheet_id
    │   └── google_refresh_token_enc
    │
    └── Google Sheet del usuario
        ├── "Semana X" (múltiples hojas)
        │   ├── Días 1-5 con ejercicios
        │   ├── Sets (columnas F-M)
        │   └── Rating (celda F10, F20, etc)
        │
        ├── "Ejercicios" (catálogo)
        │   ├── Nombre
        │   ├── Músculo
        │   ├── Categorías
        │   └── Imagen (.webp)
        │
        ├── "RM A,B,C" o "RM" (Personal Records)
        │   ├── Ejercicio
        │   ├── Peso
        │   ├── Reps
        │   └── Fecha
        │
        ├── "Fatiga" (volumen semanal)
        │   ├── Músculo
        │   ├── Series
        │   └── Calendario (Lun-Dom)
        │
        └── "Series" (opciones de prescripción)
            └── Lista de strings ("3x8-12", etc)
```

---

## 🛠️ Archivos Clave

| Archivo | Responsabilidad |
|---------|-----------------|
| `src/lib/sheets-client.ts` | Wrapper cliente para todas las llamadas a /api/sheets/* |
| `src/lib/google/sheets.ts` | Interacción directa con Google Sheets API (servidor) |
| `src/lib/hooks/useAuth.ts` | Estado de autenticación global |
| `src/lib/pwa.ts` | Helper para pre-cachear URLs en el SW |
| `next.config.js` | Configuración de estrategias de caching PWA |
| `public/sw.js` | Service Worker compilado (Workbox) |
| `src/app/page.tsx` | SSR de datos para Home |
| `src/app/progreso/page.tsx` | SSR de datos para Progreso |
