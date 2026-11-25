# Auditoría de Gym Tracker

Revisión local del 22 de noviembre de 2026, iniciada sobre `2f2e064`. El recorrido cubrió la web, la API, las integraciones, las migraciones SQL, los scripts heredados, el empaquetado y los dos lockfiles.

## Arquitectura

La app usa React y TypeScript con Vite para la PWA, Hono para la API, Supabase para las cuentas y Google Sheets para la plantilla clásica. Se conservaron esos límites. Los defectos reproducidos estaban en la asociación de filas, la persistencia, el aislamiento de caché y el manejo de respuestas asíncronas. Se actualizó React Router y se dividió la carga de las pantallas por ruta. El mapa para seguir trabajando está en [AGENTS.md](AGENTS.md).

## Hallazgos y cambios

| Área | Resultado |
| --- | --- |
| Rutina clásica | Una semana vacía podía mostrar ejercicios de la anterior y enviar un guardado con el identificador equivocado. La selección y las escrituras ahora se vinculan con su semana y día. El editor conserva los pares vacíos, admite 0 kg y permite reintentar conservando el borrador. |
| API de Sheets | La lectura en lote empareja las respuestas por posición. La edición de rutina mueve notas y series con el movimiento y protege ejercicios con historial. Crear y limpiar una semana se hace en un lote atómico. Los cinco casos de regresión se ejecutan con `npm run test:api`. |
| Cuentas y PWA | Se separó el almacenamiento de datos privados por cuenta y planilla, se corrigió el ciclo del callback OAuth y se retiró el caché compartido de respuestas privadas. |
| Rutina por bloques | La nueva ruta comparte la tabla de ejercicios, los campos para series, la navegación y el editor de rutina del proyecto. La cabecera agrupa bloque, semana y día. Conserva las posiciones de semana originales y los identificadores de los ejercicios repetidos. La casilla de realizado completa las series con las repeticiones y los kilos del plan. |
| Código común | API y web usan las mismas definiciones de entrenamiento, normalización y cálculos de fatiga en `gym-tracker/shared/`. Se retiraron el parser web sin consumidores, el manejador de autenticación duplicado y los componentes y dependencias exclusivos del mazo de tarjetas. |
| Scripts heredados | Se corrigió la detección de encabezados que confundía nombres de ejercicios con días. La importación de rutinas valida todos los días antes de escribir y la exportación al diálogo HTML escapa el contenido de la planilla. |
| Apps Script vinculado a v4 | La [propuesta para la escala de esfuerzo](apps-script/v4/aplicarEscalaPastel.gs) completa valores de RPE y RIR, reconoce reglas ya instaladas y avisa cuando se solapan con otras. Se verificó la sintaxis localmente. Su ejecución en una copia de la hoja está pendiente. |
| Entorno | Las guías identifican la raíz de cada paquete, las variables del cliente y servidor y el flujo de despliegue en Vercel. La función apunta a Node 24 y las rutas de la PWA tienen fallback para navegación directa. |

## Verificación y límites

- Pasaron el lint de la web, los chequeos TypeScript, el build de producción y las pruebas de la API. La navegación, los editores y la persistencia se ejercitaron en Chromium en perfiles temporales.
- `npm audit --omit=dev` informó cero alertas en los dos paquetes en la fecha de revisión. La auditoría completa de la web conserva tres avisos moderados de desarrollo en la cadena `workbox-build → glob → minimatch`. La rama compatible de Workbox seguía requiriendo una versión de glob afectada. [Aviso de glob](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4) · [Aviso de minimatch](https://github.com/advisories/GHSA-g3hv-75wg-m249)
- OAuth, el refresh de tokens, las políticas RLS, la copia de Drive y las escrituras de Sheets se revisaron con código y datos de prueba. La verificación extremo a extremo con credenciales y una copia de planilla, y el despliegue real en Vercel, siguen pendientes.
- En la migración 001, un usuario autenticado puede leer y actualizar su propia fila de integración, incluido el token cifrado. La API usa el token de sesión del usuario y depende de esas políticas. Restringir los campos al servidor requiere diseñar y migrar ambos lados juntos.
- `scripts/WebAppAPI.js` pertenece a la versión histórica y acepta escrituras sin autenticación propia. La exposición efectiva depende de quién puede ejecutar su despliegue de Apps Script. Esta revisión no determinó que ese endpoint esté publicado.
- Un lote de Google Sheets es atómico. Una lectura seguida de una edición manual concurrente desde otra herramienta todavía puede provocar conflictos. No se corrigieron ni reescribieron registros históricos de usuarios.
- La rutina v4 usa una copia privada de los datos y guarda los registros en el navegador. La ruta clásica conserva su integración con Google. Las pruebas locales no modificaron la planilla vinculada.
