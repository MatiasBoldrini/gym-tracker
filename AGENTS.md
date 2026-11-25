# Gym Tracker

## Mapa del repositorio

| Ruta desde esta raíz | Uso |
| --- | --- |
| `gym-tracker/apps/web/` | Frontend React, Vite y React Router. `src/App.tsx` define las rutas, `src/pages/bloques/` contiene la interfaz de v4 y `vite.config.ts` configura la PWA. |
| `gym-tracker/api-src/` | API Hono para Vercel. El punto de entrada de producción es `[[...path]].ts`. En `_lib/` están las integraciones y los parsers de Sheets. |
| `gym-tracker/shared/` | Tipos de entrenamiento, normalización y cálculos de fatiga compartidos entre la API y la web. |
| `gym-tracker/supabase/migrations/` | Migraciones SQL numeradas para integraciones y preferencias. Aplicalas en orden en un entorno de prueba cuando corresponda. |
| `gym-tracker/scripts/build-api.mjs` | Construye la función de Vercel y su configuración de rutas. |
| `apps-script/v4/` | Propuesta para la escala de colores de esfuerzo en las pestañas por bloque de v4. Se prueba desde el editor de Apps Script de una copia de la planilla. |
| `scripts/`, `GYM_SHEETS_DOCS.md`, `proyect.js.backup` | Herramientas y documentación heredadas de Rutina Gym v3. Consultá [el mapa de scripts](scripts/agents.md) antes de intervenir sobre ellas. |

La ruta `/` usa la plantilla de Sheets con pestañas `Semana N`. La ruta `/bloques` usa Rutina Gym v4. El entrenamiento de v3 pasa por `src/components/screens/HomeScreen.tsx` y el de v4 por `src/pages/bloques/BlockTraining.tsx`. Ambos comparten la lista `ExerciseList` y las filas de series `SetRows` en `src/components/ui/`. Consultá [el README del frontend](gym-tracker/apps/web/README.md).

El alcance y los pendientes de la revisión de noviembre de 2026 están en [AUDITORIA.md](AUDITORIA.md).

## Comandos

Desde esta raíz, entrá primero al directorio interno `gym-tracker/`. Usá Node 22.12 o posterior para cubrir los requisitos de los dos paquetes.

```sh
cd gym-tracker
npm ci
npm --prefix apps/web ci
VITE_DEMO_MODE=true npm run dev
```

`npm run dev` levanta Vite. El modo demo permite recorrer el frontend con datos de ejemplo sin conectar Google ni Supabase. Para una prueba de integración, configurá también el runtime de la API según la [guía de entorno](gym-tracker/SETUP_GUIDE.md).

```sh
npm run lint      # ESLint del frontend y TypeScript de la API
npm run test:api  # Pruebas del formato Semana N
npm run build     # API de Vercel y frontend de producción
```

Para cambios limitados al frontend, corren `npm --prefix apps/web run lint` y `npm --prefix apps/web run build`. Desde esta raíz también podés revisar la sintaxis de los scripts históricos con `for f in scripts/*.js; do node --check "$f" || exit 1; done`. La ejecución real de Apps Script requiere una planilla de prueba.

## Puntos de entrada al trabajar

- Para UI y lógica de navegador, consultá primero [modern-web-guidance](.agents/skills/modern-web-guidance/SKILL.md). Su revisión está registrada en [skills-lock.json](skills-lock.json). Revisá los flujos modificados en navegador y en ancho móvil.
- Si cambiás el formato `Semana N`, revisá el parser de `api-src/_lib/sheets-parse.ts` y los puntos de escritura de `api-src/_lib/google/sheets.ts` dentro de `gym-tracker/`.
- Los secretos de Google y la clave para cifrar tokens pertenecen al runtime de la API. Las variables `VITE_*` llegan al navegador. Mantené las credenciales y `gym-tracker/apps/web/.local/rutina.json` fuera del control de versiones y de los builds públicos.
- Probá cambios que escriben o borran en una copia de una planilla. Confirmá el formato de pestañas antes de elegir los scripts de v3 o el flujo de bloques de v4.
