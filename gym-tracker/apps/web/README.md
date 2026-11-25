# Web de Gym Tracker

App React con TypeScript, Vite y React Router. `src/App.tsx` define las rutas, `src/pages/` contiene las páginas y `vite.config.ts` configura la PWA.

## Desarrollo

Desde este directorio (`gym-tracker/apps/web/` dentro del checkout), usá Node 22.12 o posterior.

```sh
npm ci
VITE_DEMO_MODE=true npm run dev
npm run lint
npm run build
```

El modo demo usa datos de ejemplo. El Vite local sirve el frontend. Para probar Google y Supabase junto con la API Hono, consultá la [guía de configuración](../../SETUP_GUIDE.md).

## Bloques de Rutina Gym v4

```sh
npm run dev:bloques
```

Abrí [la rutina local](http://127.0.0.1:5175/bloques). Poné la copia privada del historial en `.local/rutina.json` dentro de este directorio. Ese archivo se usa para desarrollo local y queda fuera de Git y del build público. Una vez abierta, la app conserva la última rutina válida en ese navegador para recuperarla si se corta la red. Si Vite arranca sin una copia, podés elegir el archivo JSON desde la pantalla de importación.

Para usar hojas compartidas, compilá con `VITE_BLOCKS_CLOUD=true`, `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY`. El enlace privado abre su plan desde cualquier dispositivo. Los cambios se guardan en IndexedDB hasta que Supabase confirma su revisión. La app consulta las revisiones cada 30 segundos mientras está visible y al recuperar la conexión. En **Biblioteca → Ajustes** se pueden importar registros anteriores de ese navegador a sesiones vacías del mismo plan. Para reabrir completamente sin red, la PWA tiene que haber cargado previamente desde HTTPS o localhost. [Asignación y administración de enlaces](../../SETUP_GUIDE.md)

El encabezado muestra el título de la hoja activa. El lápiz permite pegar el enlace privado de otra plantilla o volver a una abierta en esa pestaña. **Compartir plantilla** ofrece el enlace de entrenamiento y, cuando la plantilla incluye el ID de origen, el enlace de Google Sheets. Si alojás la app en otro dominio y querés que los enlaces compartidos desde desarrollo apunten allí, configurá `VITE_BLOCKS_APP_ORIGIN` con ese origen HTTPS.

### Prueba de entrenamiento en dos dispositivos

Ejecutá estos comandos desde `apps/web`.

```sh
npx playwright install chromium
npm run test:blocks:e2e
```

La batería compila la PWA en un directorio temporal. Prueba tanto dos pestañas que comparten almacenamiento como dos perfiles independientes. El servidor local simula respuestas incompletas, confirmaciones perdidas y rechazos de datos. Las pruebas verifican qué revisión quedó guardada al reconectar, corregir una serie o elegir entre dos versiones. También cubren la reapertura sin red, la falta de espacio para copiar el plan, el cambio de hoja y las ediciones que llegan desde Sheets.

Si ya tenés Chrome instalado podés ejecutar `PLAYWRIGHT_CHROMIUM_CHANNEL=chrome npm run test:blocks:e2e`. Para probar WebKit, instalá su navegador con `npx playwright install webkit` y usá `E2E_BROWSER=webkit npm run test:blocks:e2e`.

En la planilla de v4, cada pestaña de rutina es un bloque con semanas y días. En **Rutina**, seleccioná el día y abrí un ejercicio desde la lista para registrar sus series en filas con repeticiones o tiempo, carga y esfuerzo. **Progreso** reúne el historial, las cargas y la fatiga. **Biblioteca** reúne el catálogo, la activación y la tabla RPE. Los bloques locales creados anteriormente siguen disponibles en el selector de **Rutina**. En modo local, las sesiones registradas se guardan en el navegador para este origen.

La ruta `/` usa la plantilla `Semana N` y la integración de Google configurada para la cuenta. También abre las filas de series desde la lista de ejercicios.

En **Rutina**, deslizá hacia la derecha sobre la lista para ir al día siguiente de la semana o hacia la izquierda para volver al anterior. También podés elegir el día en el breadcrumb.

En `/bloques`, cada día se abre listo para editar, también desde el historial. El primer cambio crea el registro en este navegador con la calificación inicial de la planilla. Cada ejercicio tiene las filas de series que indica el plan. Al abrir el ejercicio se precargan las repeticiones o el tiempo y la carga indicada en la planilla. Si la carga está vacía, podés ingresarla. Los cambios en los campos y en la nota se guardan al escribir. Tocar el círculo de una serie la marca o desmarca y actualiza el progreso del ejercicio. Tocar el círculo de progreso del ejercicio completa las series con las repeticiones y la carga asignadas. Al destildarlo se conservan las entradas manuales. La miniatura junto al nombre abre su ilustración. Las estrellas se tocan directamente para calificar la sesión. La opción **Sin calificar** borra la puntuación. En **Biblioteca → Ajustes** podés habilitar el RPE/RIR dentro de los ejercicios. Al completar todos los ejercicios se marca la sesión como finalizada y sus filas siguen siendo editables. Las notas se reúnen en el orden del plan. El historial reúne todos los bloques en una sola lista. Cada día registrado aparece una vez, con sus notas y la última calificación. Las sesiones que tienen fecha de entrenamiento aparecen primero, de la más reciente a la más antigua.

**Progreso → Fatiga** muestra las series planificadas de la semana. Cada pieza muscular de [Free Muscle](https://github.com/tiralonghipol/free-muscles/tree/605dd1ca351421ad874a03f673a2a3f915ab254e) conserva su posición anatómica y se selecciona junto a su grupo para ver el reparto por día. El modelo de tiralonghipol deriva de Z-Anatomy y BodyParts3D © The Database Center for Life Science. La adaptación local simplifica las piezas, las reúne en siete grupos de entrenamiento y mantiene el esqueleto y los demás tejidos como referencia. Se distribuye bajo [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Para regenerar el GLB desde este directorio, ejecutá `node ../../scripts/prepare-fatigue-atlas.mjs` con las dependencias de desarrollo del paquete raíz instaladas. El script verifica la huella de la descarga y también admite la ruta a una copia local del GLB original. El visor carga solo el modelo preparado.

**Biblioteca → Ejercicios** abre [el catálogo ilustrado](http://127.0.0.1:5175/bloques/imagenes). Vite lee el catálogo original `Rutina Gym - Gym Tracker - Ejercicios.csv` durante la compilación. Las ilustraciones viven en `public/images/exercises/` y los alias de la planilla en `src/pages/bloques/exercise-image.ts`.

**Progreso → Cargas** y cada ficha de **Biblioteca → Ejercicios** comparten la evolución semanal de fuerza. Elegí la variante para comparar la carga máxima del plan con la de tus series registradas. El **1RM estimado** usa la tabla RPE de la rutina cuando coinciden las repeticiones y el esfuerzo de la serie. **Biblioteca → Activación** enlaza los movimientos reconocidos con sus videos de demostración.

## Cambios de interfaz

La pantalla de entrenamiento mantiene una lista continua. En el teléfono, cada fila muestra el nombre, el plan y la carga. En pantallas anchas, las series tienen su propia columna. El editor se despliega en esa misma fila. En bloques, muestra el último registro disponible para ese movimiento en los días anteriores del bloque y precarga la indicación de la sesión actual. Este flujo toma como referencia el registro de series de [MacroFactor Workouts](https://macrofactor.com/wp-content/uploads/2026/01/Workouts-Quick-Start-Guide.pdf).

En `/bloques`, el título proviene de `properties.title` de la copia de Sheets. Tocá el título para darle un nombre local en ese navegador. Borrá el nombre para volver al de origen. Debajo aparece la ruta «Bloque › Semana › Día». La ruta tiene un fondo redondeado y cada tramo abre un menú de opciones de la app. La ruta clásica conserva el selector de días con indicador deslizante y gesto de arrastre. En ambas rutas, la flecha acompaña la apertura y el foco vuelve al ejercicio al cerrar su fila. Probá la reapertura inmediata y la preferencia del sistema de reducir movimiento. [Movimiento en las Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/motion)

Consultá la skill [modern-web-guidance](../../../.agents/skills/modern-web-guidance/SKILL.md) desde el checkout y usá las instrucciones de [AGENTS.md](../../../AGENTS.md) para elegir las verificaciones de la tarea.
