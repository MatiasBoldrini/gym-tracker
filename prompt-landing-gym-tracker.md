# Prompt: Landing Page para Gym Tracker

## Contexto y Propósito

Crea una landing page moderna y elegante para **Gym Tracker**, una aplicación web de seguimiento de rutinas de gimnasio que sincroniza datos con Google Sheets. La landing debe reflejar la filosofía de diseño iOS minimalista de la aplicación y transmitir profesionalismo, simplicidad y eficiencia.

---

## Filosofía de Diseño

### Estética Visual: iOS Minimalista

**Paleta de Colores:**

- **Color Primario:** Azul iOS (`#007AFF`) - Usar para CTAs, elementos interactivos destacados, y acentos
- **Color de Éxito:** Verde iOS (`#34C759`) - Para indicadores de progreso y estados positivos
- **Grises:**
  - Gris iOS (`#8E8E93`) - Textos secundarios
  - Gris Claro iOS (`#E5E5EA`) - Bordes sutiles y separadores
  - Fondo (`#F2F2F7`) - Color de fondo principal
- **Blanco (`#FFFFFF`)** - Cards y contenedores principales
- **Negro con opacidad (`rgba(0, 0, 0, 0.05)`)** - Para bordes sutiles

**Tipografía:**

- Font Stack: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`
- Pesos: Regular (400), Medium (500), Semibold (600), Bold (700), Extrabold (800), Black (900)
- Uppercase con tracking amplio para etiquetas y subtítulos pequeños
- Títulos principales: font-extrabold o font-black

**Sombras y Profundidad:**

- Sombra principal iOS: `0 4px 12px rgba(0, 0, 0, 0.05)`
- Bordes sutiles: `border border-black/5`
- Sombras de color para acentos: `shadow-lg shadow-ios-blue/30`

**Bordes Redondeados:**

- Cards grandes: `border-radius: 20px` (rounded-ios-xl)
- Elementos medianos: `border-radius: 12px` (rounded-ios-lg)
- Botones pequeños/badges: `border-radius: 16px` o `24px`
- Elementos muy pequeños: `border-radius: 8px`

**Espaciado:**

- Generoso pero consistente
- Padding en cards: mínimo 24px (p-6)
- Gaps entre elementos: 16px, 24px, 32px según jerarquía
- Margen vertical entre secciones: 48px-80px

---

## Objetivo y Mensaje Central

### Propuesta de Valor:

1. **Sincronización Inteligente:** Tu rutina vive en Google Sheets, siempre accesible y bajo tu control
2. **Simplicidad Elegante:** Interfaz iOS minimalista que se enfoca en lo esencial - tus ejercicios
3. **Progreso Visual:** Visualiza tu progreso, récords personales y fatiga muscular de forma clara
4. **Rutinas Organizadas:** Gestiona semanas de entrenamiento con navegación intuitiva tipo stack de cards

### Mensaje a Transmitir:

- **"Entrenamiento inteligente, sin complicaciones"**
- **"Tu progreso, visualizado de forma elegante"**
- **"Rutinas que fluyen, resultados que importan"**
- **"Diseño que no distrae, funcionalidad que potencia"**

---

## Estructura de la Landing Page

### 1. Hero Section

**Objetivo:** Captar atención inmediata y comunicar valor principal, mostrando la experiencia real de la aplicación

**Elementos:**

- **Headline Principal:** Título grande (text-5xl a text-6xl), font-black, tracking-tight
  - Ejemplo: "Tu rutina de gimnasio, simplificada"
- **Subheadline:** Texto descriptivo (text-xl), color ios-gray, font-medium
  - Ejemplo: "Visualiza, registra y progresa con una interfaz elegante que sincroniza con Google Sheets"
- **CTA Principal:** Botón grande, fondo ios-blue, texto blanco, padding generoso (px-8 py-4), border-radius 16px
  - Texto: "Comenzar ahora" o "Probar gratis"
- **CTA Secundario (opcional):** Botón outline, borde ios-blue, texto ios-blue, fondo transparente

**Diseño Visual:**

- Fondo: `#F2F2F7` (ios-background)
- **Mockup Principal:** Mostrar la pantalla principal de la app (HomeScreen) con el stack de cards de ejercicios
- Animación sutil: El stack puede tener una ligera animación de rotación o autoplay muy sutil (opcional)
- Espaciado vertical generoso (py-20 o py-24)

**Disposición:**

- Desktop: Layout en dos columnas (texto izquierda, mockup derecha) o centrado con mockup arriba
- Mobile: Stack vertical, mockup arriba, texto abajo

---

### 📱 Mockup Detallado: Pantalla Principal con Stack de Cards

**OBJETIVO:** Replicar fielmente la pantalla principal (HomeScreen) de la aplicación para mostrar cómo se ve y funciona realmente la app.

#### Estructura del Mockup

El mockup debe mostrar una captura o renderizado de la pantalla principal completa, incluyendo:

**1. Header Superior:**

- **Posición:** Parte superior del mockup
- **Contenido:**
  - Título "Mi Rutina" (izquierda)
    - Estilo: `text-3xl font-extrabold tracking-tight text-black`
  - Subtítulo con ícono de calendario (debajo del título)
    - Estilo: `text-sm font-semibold uppercase tracking-wider text-ios-gray`
    - Contenido: Ícono Calendar (lucide-react, size 14px) + "Semana 1"
  - Avatar/Iniciales del usuario (derecha)
    - Contenedor: `bg-white rounded-full p-2 shadow-ios border border-black/5`
    - Avatar interno: `w-8 h-8 rounded-full bg-ios-blue text-white font-bold text-xs`
    - Iniciales: "MB" o "US" (ejemplo)
- **Layout:** Flex justify-between, items-end

**2. Selector de Días (Day Selector Tabs):**

- **Posición:** Debajo del header, antes del stack
- **Diseño:** Fila horizontal de botones/pills
- **Cantidad:** Muestra 4-5 días (Día 1, Día 2, Día 3, Día 4, Día 5)
- **Estilo de cada día:**
  - Día activo (ej: Día 1):
    - Label: `text-[10px] font-bold uppercase mb-1 text-ios-blue`
    - Botón: `w-12 h-12 rounded-2xl bg-ios-blue text-white shadow-lg shadow-ios-blue/30 font-bold text-lg`
    - Container: `scale-105` (ligera escala)
  - Días inactivos:
    - Label: `text-[10px] font-bold uppercase mb-1 text-gray-500`
    - Botón: `w-12 h-12 rounded-2xl bg-white text-gray-400 font-bold text-lg`
    - Container: `opacity-40`
- **Layout:** Flex gap-4, scroll horizontal invisible

**3. Stack de Cards de Ejercicios (Elemento Principal):**

**Diseño del Stack:**

- **Contenedor:**
  - Dimensiones: `h-[420px] w-full` (aproximado, ajustable)
  - Perspective: `600px` (para efecto 3D)
  - Posición: Centrado verticalmente
- **Cards visibles:** Mostrar las 3 cards superiores del stack (las demás están ocultas)

**Estructura de cada Card (ExerciseCard):**

- **Contenedor principal:**

  - Background: `bg-white`
  - Border-radius: `rounded-[32px]` (32px, muy redondeado)
  - Padding: `p-6` (24px)
  - Sombra: `shadow-2xl border border-black/5`
  - Layout: Flex column, altura completa

- **Header de la card:**

  - Título del ejercicio (ej: "PRESS BANCA")
    - Estilo: `text-2xl font-black uppercase tracking-tight text-black leading-tight`
    - Ejemplos: "PRESS BANCA", "SENTADILLA", "PESO MUERTO", "PRESS MILITAR"
  - Información de series (debajo del título)
    - Series prescritas: `text-lg font-bold text-gray-400` (ej: "3 x 8-12")
    - PR opcional: `text-lg font-bold text-gray-400` (ej: "(10 x 80kg)")

- **Área de imagen del ejercicio (sección central):**

  - Contenedor:
    - Background: `bg-ios-blue/5` (azul muy claro, 5% opacidad)
    - Border-radius: `rounded-[24px]` (24px)
    - Border: `border border-ios-blue/10` (borde azul muy sutil)
    - Layout: Flex items-center justify-center
    - Altura: Flex-1 (ocupa espacio disponible)
  - Imagen del ejercicio:
    - Ubicación: Centrada dentro del contenedor
    - Estilo: Object-contain, ajustada al contenedor
    - Ejemplos de ejercicios para mostrar:
      - Press banca (hombro/pecho)
      - Sentadilla (piernas)
      - Peso muerto (posterior)
      - Press militar (hombros)
    - Formato: Puede ser ilustración SVG, imagen PNG/WebP, o icono estilizado
  - Overlay: Gradiente sutil `bg-gradient-to-t from-black/5 to-transparent` (muy sutil)

- **Footer de progreso (opcional, si la card tiene progreso):**
  - Contenedor: `flex items-center gap-3 pt-2`
  - Barra de progreso segmentada:
    - Label: `text-[10px] uppercase font-black tracking-wider text-gray-400`
    - Contador: `text-xs font-black text-ios-green` (ej: "3/3")
    - Barras segmentadas:
      - Completa: `bg-ios-green rounded-full h-1.5 flex-1`
      - Pendiente: `bg-gray-100 rounded-full h-1.5 flex-1`
      - Gap entre barras: `gap-1`
  - Ícono de estado:
    - Completo: `w-8 h-8 rounded-full bg-ios-green text-white` con Check icon
    - Incompleto: `w-8 h-8 rounded-full bg-gray-100 text-gray-400` con número

**Efecto de Apilado (Stack Effect):**

- **Card superior (top card):**

  - Rotación: `0deg` (sin rotación)
  - Escala: `1.0` (tamaño completo)
  - Posición Y: `0px` (en la parte superior)
  - Z-index: Más alto (visible completamente)
  - Sombra: `shadow-2xl` (sombra pronunciada)

- **Segunda card (debajo):**

  - Rotación: Aproximadamente `3deg` (rotación sutil, puede ser aleatoria entre -3 a +3)
  - Escala: `0.95` (ligeramente más pequeña)
  - Posición Y: `-4px` (ligeramente desplazada hacia arriba)
  - Z-index: Medio
  - Sombra: Menos pronunciada

- **Tercera card (fondo):**

  - Rotación: Aproximadamente `6deg` (rotación más marcada, puede ser aleatoria entre -3 a +3)
  - Escala: `0.90` (aún más pequeña)
  - Posición Y: `-8px` (más desplazada)
  - Z-index: Más bajo
  - Sombra: Muy sutil

- **Transform origin:** `50% 100%` (rotación desde el centro inferior)

**4. Texto de ayuda (debajo del stack):**

- Texto: "Toca o desliza para navegar"
- Estilo: `text-center text-ios-gray text-[10px] font-black uppercase tracking-[0.2em] opacity-40`
- Posición: Centrado, debajo del stack

**5. Información del día activo:**

- Título del día (ej: "Pecho y Tríceps")
  - Estilo: `text-xl font-bold`
- Badge con cantidad de ejercicios
  - Estilo: `text-[10px] bg-black text-white px-2 py-1 rounded-full font-bold uppercase tracking-wider`
  - Contenido: "5 Ejercicios" (ejemplo)
- Posición: Arriba del stack, centrado o alineado a la izquierda

#### Especificaciones Técnicas del Mockup

**Dimensiones recomendadas:**

- Desktop: Ancho máximo 400px-480px (representa un móvil o tablet pequeño)
- Mobile: Ancho completo (ajustable)
- Altura: Aproximadamente 600px-700px (incluyendo header, selector, stack y texto)

**Fondo del mockup:**

- Color: `#F2F2F7` (ios-background)
- Padding: `px-5 pt-8` (similar a la app real)

**Frame opcional (para estilo más profesional):**

- Puedes incluir un frame de iPhone/MacBook alrededor del mockup
- O simplemente mostrar el contenido directamente sobre el fondo de la landing

#### Ejemplos de Cards a Mostrar

Para el mockup, muestra 3-4 cards diferentes apiladas. Ejemplos:

1. **Card superior (top):** "PRESS BANCA"

   - Series: "3 x 8-12"
   - Imagen: Ejercicio de press banca
   - Progreso: 2/3 (opcional, para mostrar estado incompleto)

2. **Segunda card (visible parcialmente):** "SENTADILLA"

   - Series: "4 x 6-8"
   - Imagen: Ejercicio de sentadilla
   - Progreso: 4/4 completo (opcional, para mostrar estado completo)

3. **Tercera card (fondo, muy sutil):** "PESO MUERTO"
   - Series: "3 x 5"
   - Imagen: Ejercicio de peso muerto

#### Interactividad del Stack (REQUERIDO)

**⚠️ IMPORTANTE: Los stacks DEBEN ser interactivos y arrastrables en el hero de la landing.**

**Implementación del Stack Interactivo:**

1. **Librería requerida:** Framer Motion (`framer-motion`)
2. **Funcionalidad:** El usuario debe poder arrastrar/swipe las cards para navegar entre ejercicios

**Comportamiento del arrastre:**

- **Swipe horizontal (izquierda/derecha):**
  - Swipe izquierda → Siguiente ejercicio (card actual va al fondo del stack)
  - Swipe derecha → Ejercicio anterior (card anterior vuelve al frente)
  - Sensibilidad: Mínimo 150px de desplazamiento para activar
- **Swipe vertical:**
  - Swipe vertical hacia arriba → También avanza al siguiente ejercicio (compatibilidad con gesto vertical)

**Configuración técnica:**

- Usar `motion.div` de framer-motion con `drag` prop
- `dragConstraints`: `{ top: 0, right: 0, bottom: 0, left: 0 }` (arrastre libre)
- `dragElastic`: `0.6` (elasticidad del arrastre)
- `onDragEnd`: Función que detecta dirección y mueve la card correspondiente
- Sensibilidad mínima: `150px` de desplazamiento para activar navegación

**Transiciones:**

- Tipo: Spring animation
- Stiffness: `300`
- Damping: `25`
- Transform origin: `50% 100%` (rotación desde el centro inferior)

**Ejemplo de código para el Stack interactivo:**

```typescript
// Componente CardRotate (para cada card individual)
function CardRotate({ children, onSwipeNext, onSwipePrev, sensitivity = 150 }) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  function handleDragEnd(event, info) {
    const absX = Math.abs(info.offset.x);
    const absY = Math.abs(info.offset.y);

    // Preferir dirección horizontal para navegación
    if (absX > absY && absX > sensitivity) {
      if (info.offset.x < 0) onSwipeNext(); // swipe izquierda => siguiente
      else onSwipePrev(); // swipe derecha => anterior
      return;
    }

    // Swipe vertical también avanza
    if (absY > sensitivity) {
      onSwipeNext();
      return;
    }

    // Reset si no alcanza sensibilidad
    x.set(0);
    y.set(0);
  }

  return (
    <motion.div
      className="absolute inset-0 cursor-grab active:cursor-grabbing"
      style={{ x, y }}
      drag
      dragConstraints={{ top: 0, right: 0, bottom: 0, left: 0 }}
      dragElastic={0.6}
      onDragEnd={handleDragEnd}
    >
      {children}
    </motion.div>
  );
}

// Container del Stack
function InteractiveStack({ cards }) {
  const [stack, setStack] = useState(
    cards.map((content, index) => ({ id: index + 1, content })).reverse()
  );

  const sendToBack = (id) => {
    setStack((prev) => {
      const newStack = [...prev];
      const index = newStack.findIndex((card) => card.id === id);
      const [card] = newStack.splice(index, 1);
      newStack.unshift(card);
      return newStack;
    });
  };

  const bringPrevToTop = () => {
    setStack((prev) => {
      if (prev.length <= 1) return prev;
      const next = [...prev];
      const [bottom] = next.splice(0, 1);
      next.push(bottom);
      return next;
    });
  };

  return (
    <div className="relative w-full h-[420px]" style={{ perspective: 600 }}>
      {stack.slice(-3).map((card, index) => {
        const isTop = index === stack.slice(-3).length - 1;
        const stackIndex = stack.length - stack.slice(-3).length + index;

        return (
          <CardRotate
            key={card.id}
            onSwipeNext={() => sendToBack(card.id)}
            onSwipePrev={bringPrevToTop}
            sensitivity={150}
          >
            <motion.div
              className="rounded-[32px] overflow-hidden w-full h-full"
              animate={{
                rotateZ: isTop ? 0 : (stack.slice(-3).length - index - 1) * 3,
                scale: 1 + index * 0.05 - stack.slice(-3).length * 0.05,
                y: isTop ? 0 : (stack.slice(-3).length - index - 1) * -4,
                transformOrigin: "50% 100%",
              }}
              transition={{
                type: "spring",
                stiffness: 300,
                damping: 25,
              }}
            >
              {card.content}
            </motion.div>
          </CardRotate>
        );
      })}
    </div>
  );
}
```

**Consideraciones de UX:**

- Cursor visual: `cursor-grab` en hover, `cursor-grabbing` mientras arrastra
- Feedback visual: La card debe seguir el movimiento del cursor/dedo mientras se arrastra
- Al soltar, la card debe volver a su posición (si no alcanza sensibilidad) o navegar al siguiente/anterior
- Mobile: Debe funcionar perfectamente con touch gestures
- Desktop: Debe funcionar con mouse drag

**Texto de ayuda (actualizar):**

- Cambiar a: "Arrastra o desliza para navegar"
- O mantener: "Toca o desliza para navegar" (funciona en ambos contextos)

#### Imágenes de Ejercicios

**Recomendaciones:**

- Usar ilustraciones simples y minimalistas (estilo iOS)
- Pueden ser SVGs vectoriales, iconos estilizados, o imágenes PNG/WebP
- Estilo: Siluetas simples, colores sutiles (preferiblemente en escala de grises o azules muy suaves)
- Si usas fotos reales, aplica un filtro muy sutil para mantener el estilo minimalista

**Ejemplos de estilo visual:**

- Siluetas de personas haciendo ejercicios
- Iconos minimalistas tipo lucide-react
- Ilustraciones planas (flat design) con colores sutiles
- Formas geométricas simples representando el movimiento

#### Contenido del Mockup

**Texto de ejemplo para mostrar:**

- Header: "Mi Rutina" + "Semana 1"
- Días: Día 1 (activo), Día 2, Día 3, Día 4, Día 5
- Día activo: "Pecho y Tríceps" + "5 Ejercicios"
- Cards:
  - "PRESS BANCA" - "3 x 8-12" - (10 x 80kg)
  - "SENTADILLA" - "4 x 6-8"
  - "PESO MUERTO" - "3 x 5"

---

### Notas de Implementación - Mock 1 (Hero con Stack Interactivo)

**Para el desarrollador/diseñador:**

1. **Fidelidad:** El mockup debe ser lo más fiel posible a la app real, usando exactamente los mismos estilos CSS/Tailwind

2. **Interactividad REQUERIDA:** Los stacks DEBEN ser interactivos y arrastrables. No solo mostrar una imagen estática.

3. **Responsive:** El mockup debe adaptarse bien tanto en desktop como mobile, manteniendo las proporciones

4. **Performance:** Optimizar las animaciones de framer-motion para que no afecten el rendimiento

5. **Accesibilidad:** Asegurar que el stack tenga instrucciones claras para usuarios con diferentes capacidades

6. **Variaciones:** Puedes crear variaciones mostrando diferentes ejercicios o diferentes estados (con/sin progreso, diferentes días activos)

---

## 📱 Mock 2: Modal de Ejercicio (Exercise Modal)

**OBJETIVO:** Mostrar un segundo mockup que muestre el modal/popup que se abre al hacer clic en una card del stack. Este modal permite registrar las series (peso y repeticiones) con selectores estilo iOS.

### Ubicación en la Landing

**Opciones de presentación:**

1. **Sección dedicada después del hero:**

   - Título: "Registra tu progreso con precisión"
   - Subtítulo: "Toca cualquier ejercicio para registrar tus series con selectores estilo iOS"
   - Mostrar el modal abierto (sin backdrop oscuro, o con backdrop sutil)

2. **En la sección de características:**

   - Como parte de una característica "Registro de Series"
   - Modal mostrado como ejemplo visual

3. **Sección interactiva:**
   - Permitir que el usuario haga clic en una card del stack del hero
   - Abrir el modal real en la landing (componente interactivo)

### Estructura del Modal (ExerciseModal)

#### 1. Backdrop (Fondo oscuro)

**Diseño:**

- Color: `bg-black/40` (negro con 40% opacidad)
- Blur: `backdrop-blur-sm` (blur sutil)
- Z-index: `z-50`
- Posición: `fixed inset-0`
- Animación: Fade in/out al abrir/cerrar
  - Initial: `opacity: 0`
  - Animate: `opacity: 1`
  - Transition: Suave, ~200ms

**Código de ejemplo:**

```tsx
<motion.div
  initial={{ opacity: 0 }}
  animate={{ opacity: 1 }}
  exit={{ opacity: 0 }}
  className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
  onClick={onClose}
/>
```

#### 2. Contenedor del Modal

**Diseño:**

- Background: `bg-white`
- Border-radius superior: `rounded-t-[32px]` (32px solo en la parte superior)
- Posición: `fixed bottom-0 left-0 right-0`
- Padding: `px-6 pt-2 pb-20`
- Sombra: `shadow-2xl`
- Max-height: `max-h-[90vh]`
- Overflow: `overflow-y-auto` (scroll si el contenido es muy largo)
- Z-index: `z-50`

**Animación de entrada:**

- Initial: `y: "100%"` (completamente fuera de pantalla, abajo)
- Animate: `y: 0` (en su posición normal)
- Exit: `y: "100%"` (vuelve a salir por abajo)
- Transition: Spring animation
  - Type: `"spring"`
  - Damping: `25`
  - Stiffness: `200`

**Código de ejemplo:**

```tsx
<motion.div
  initial={{ y: "100%" }}
  animate={{ y: 0 }}
  exit={{ y: "100%" }}
  transition={{ type: "spring", damping: 25, stiffness: 200 }}
  className="fixed bottom-0 left-0 right-0 bg-white rounded-t-[32px] z-50 px-6 pt-2 pb-20 shadow-2xl max-h-[90vh] overflow-y-auto"
>
  {/* Contenido del modal */}
</motion.div>
```

#### 3. Handle (Barra de arrastre superior)

**Diseño:**

- Ubicación: Parte superior del modal, centrado
- Estilo: Barra horizontal pequeña
- Width: `w-12` (48px)
- Height: `h-1.5` (6px)
- Background: `bg-gray-200`
- Border-radius: `rounded-full`
- Margin: `mb-6` (24px debajo)

**Propósito:** Indica visualmente que el modal puede cerrarse arrastrando hacia abajo

**Código de ejemplo:**

```tsx
<div className="flex justify-center mb-6">
  <div className="w-12 h-1.5 bg-gray-200 rounded-full" />
</div>
```

#### 4. Header del Modal

**Layout:** Flex justify-between, items-start

**Lado izquierdo:**

- Título del ejercicio:
  - Estilo: `text-2xl font-black tracking-tight text-black leading-tight uppercase`
  - Contenido: Nombre del ejercicio en mayúsculas (ej: "PRESS BANCA")
- Subtítulo (series prescritas):
  - Estilo: `text-ios-gray font-bold text-sm uppercase tracking-wide`
  - Contenido: Series prescritas (ej: "3 x 8-12")
  - Posición: Debajo del título

**Lado derecho:**

- Botón de cerrar:
  - Estilo: `w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center text-gray-500`
  - Ícono: X (lucide-react, size 20)
  - Active state: `active:scale-90` (escala ligeramente al presionar)
  - Transition: `transition-transform`

**Código de ejemplo:**

```tsx
<div className="flex justify-between items-start mb-6">
  <div>
    <h2 className="text-2xl font-black tracking-tight text-black leading-tight uppercase">
      {exercise.name}
    </h2>
    <p className="text-ios-gray font-bold text-sm uppercase tracking-wide">
      {exercise.prescribedSeries}
    </p>
  </div>
  <button
    onClick={onClose}
    className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center text-gray-500 active:scale-90 transition-transform"
  >
    <X size={20} />
  </button>
</div>
```

#### 5. Sección de Record Personal (PR) ⭐

**⚠️ IMPORTANTE: Esta sección es clave y debe mostrarse prominente.**

**Diseño:**

- Contenedor:
  - Background: `bg-ios-blue/5` (azul iOS muy claro, 5% opacidad)
  - Border-radius: `rounded-2xl` (24px)
  - Padding: `p-4` (16px)
  - Margin: `mb-6` (24px debajo)
  - Border: `border border-ios-blue/10` (borde azul muy sutil)
- Layout interno: Flex justify-between, items-center

**Lado izquierdo:**

- Label "Record Personal":
  - Estilo: `text-[10px] font-black text-ios-blue uppercase tracking-widest leading-none`
  - Color: `text-ios-blue` (azul iOS #007AFF)
  - Tracking: `tracking-widest` (espaciado amplio entre letras)

**Lado derecho:**

- Valor del PR:
  - Estilo: `text-xl font-black text-ios-blue leading-none`
  - Formato: `{peso}kg x {reps}` (ej: "80kg x 10")
  - Color: `text-ios-blue` (azul iOS #007AFF)

**Código de ejemplo:**

```tsx
{
  pr && (
    <div className="bg-ios-blue/5 rounded-2xl p-4 mb-6 border border-ios-blue/10">
      <div className="flex justify-between items-center">
        <span className="text-[10px] font-black text-ios-blue uppercase tracking-widest leading-none">
          Record Personal
        </span>
        <span className="text-xl font-black text-ios-blue leading-none">
          {pr.weight}kg x {pr.reps}
        </span>
      </div>
    </div>
  );
}
```

**Ejemplo de contenido a mostrar:**

- Label: "RECORD PERSONAL"
- Valor: "80kg x 10" (o cualquier otro ejemplo realista)

#### 6. Selector de Series (Set Tabs)

**Diseño:**

- Layout: Flex horizontal con gap
- Gap: `gap-2` (8px entre tabs)
- Overflow: `overflow-x-auto` con `no-scrollbar` (scroll horizontal invisible)
- Padding: `pb-2` (8px abajo)
- Margin: `mb-8` (32px debajo)

**Tabs de series (botones):**

- Cada tab representa una serie (Serie 1, Serie 2, Serie 3, Serie 4)
- Width: `flex-1 min-w-[85px]` (crece, mínimo 85px)
- Padding: `py-3` (12px vertical)
- Border-radius: `rounded-2xl` (24px)
- Font: `font-black text-[10px] uppercase tracking-wider`
- Layout: Flex items-center justify-center gap-1.5

**Estados de los tabs:**

1. **Tab activo:**

   - Background: `bg-black text-white`
   - Sombra: `shadow-lg shadow-black/20`
   - Ícono: Check blanco (si está completado)

2. **Tab completado (no activo):**

   - Background: `bg-ios-green/10 text-ios-green`
   - Border: `border border-ios-green/20`
   - Ícono: Check verde (`<Check size={12} strokeWidth={3} className="text-ios-green" />`)

3. **Tab pendiente (no activo):**
   - Background: `bg-gray-100 text-gray-400`
   - Sin ícono

**Botón de agregar serie (+):**

- Visible solo si hay menos de 4 series
- Width: `w-12` (48px)
- Height: `h-10` (40px)
- Background: `bg-ios-blue/10 text-ios-blue`
- Border-radius: `rounded-2xl`
- Ícono: Plus (lucide-react, size 20)
- Active state: `active:scale-95`
- Shrink: `shrink-0` (no se comprime)

**Código de ejemplo:**

```tsx
<div className="flex gap-2 mb-8 overflow-x-auto no-scrollbar pb-2">
  {sets.map((_, idx) => (
    <button
      key={idx}
      onClick={() => setActiveSetIndex(idx)}
      className={`
        flex-1 min-w-[85px] py-3 rounded-2xl font-black text-[10px] uppercase tracking-wider transition-all relative flex items-center justify-center gap-1.5
        ${
          activeSetIndex === idx
            ? "bg-black text-white shadow-lg shadow-black/20"
            : completedSets[idx]
            ? "bg-ios-green/10 text-ios-green border border-ios-green/20"
            : "bg-gray-100 text-gray-400"
        }
      `}
    >
      {completedSets[idx] && (
        <Check
          size={12}
          strokeWidth={3}
          className={activeSetIndex === idx ? "text-white" : "text-ios-green"}
        />
      )}
      Serie {idx + 1}
    </button>
  ))}
  {sets.length < 4 && (
    <button
      onClick={addSet}
      className="w-12 h-10 flex items-center justify-center bg-ios-blue/10 text-ios-blue rounded-2xl active:scale-95 transition-transform shrink-0"
    >
      <Plus size={20} />
    </button>
  )}
</div>
```

#### 7. Selector de Peso y Repeticiones (IOS Picker) ⭐

**⚠️ IMPORTANTE: Este es el elemento más distintivo del modal. El selector estilo iOS es clave.**

**Contenedor del selector:**

- Background: `bg-gray-50` (gris muy claro)
- Border-radius: `rounded-[24px]` (24px)
- Border: `border border-black/5` (borde muy sutil)
- Height: `h-[200px]` (200px de altura fija)
- Overflow: `overflow-hidden`
- Transition: Opacidad y escala cuando está completado
  - Completado: `opacity-30 grayscale pointer-events-none scale-95`
  - Activo: `opacity-100 scale-100`

**Labels superiores:**

- Layout: Flex justify-around
- Labels:
  - "Peso (kg)": Izquierda
  - "Reps": Derecha
- Estilo: `text-[10px] font-black text-gray-300 uppercase tracking-[0.2em]`
- Margin: `mb-2 px-4`

**Contenedor del picker:**

- Clase: `ios-picker-container`
- Width: `w-full`
- Height: `h-[200px]`
- Overflow: `overflow-hidden relative`
- Grid: `grid grid-cols-2` (2 columnas: peso y reps)

**Gradiente overlay (mask):**

- Propósito: Efecto de fade en los bordes superior e inferior
- Estilo: Gradiente linear vertical
- Background: `linear-gradient(to bottom, rgba(249,250,251,1) 0%, rgba(249,250,251,0) 30%, rgba(249,250,251,0) 70%, rgba(249,250,251,1) 100%)`
- Posición: `absolute inset-0 pointer-events-none z-10`

**Columnas del picker (Peso y Reps):**

Cada columna tiene:

- Height: `h-[200px]`
- Overflow: `overflow-y-scroll no-scrollbar`
- Webkit scroll: `-webkit-overflow-scrolling: touch` (inercia en iOS)
- Touch action: `touch-action: pan-y` (solo scroll vertical)
- Padding superior e inferior: `(height - itemHeight) / 2` (para centrar el item seleccionado)

**Items del picker:**

- Height: `h-[40px]` (40px cada item)
- Layout: `flex items-center justify-center`
- Transición: `transition-all duration-75`
- Select-none: `select-none` (no seleccionable)

**Estados de los items:**

1. **Item seleccionado (centro):**

   - Font: `text-black font-black text-2xl scale-110`
   - Tamaño: Más grande (2xl) y escalado (110%)

2. **Items no seleccionados:**
   - Font: `text-gray-300 font-medium text-lg`
   - Tamaño: Más pequeño (lg)

**Rango de valores:**

- **Peso (kg):**

  - Rango: 0 a 200kg
  - Incrementos: 0.5kg (ej: 0, 0.5, 1, 1.5, 2, ... 200)
  - Array: `Array.from({ length: 401 }, (_, i) => i * 0.5)`

- **Repeticiones:**
  - Rango: 0 a 30 reps
  - Incrementos: 1 (ej: 0, 1, 2, 3, ... 30)
  - Array: `Array.from({ length: 31 }, (_, i) => i)`

**Línea de selección (overlay):**

- Posición: Centrada verticalmente en el picker
- Estilo: `absolute inset-x-0 top-1/2 -translate-y-1/2 h-12 border-y border-black/5`
- Propósito: Línea visual que indica qué valor está seleccionado
- Pointer-events: `pointer-events-none` (no interfiere con el scroll)

**Comportamiento del scroll:**

- Snap al item: Al terminar de hacer scroll, el picker hace snap automático al item más cercano al centro
- Smooth scroll: Transición suave al hacer snap
- Delay de snap: ~50ms después de que termina el scroll
- Inercia: Máxima inercia en iOS con `-webkit-overflow-scrolling: touch`

**Código de ejemplo completo del IOS Picker:**

```tsx
function IOSPicker({ value, onChange, selections }) {
  const height = 200;
  const itemHeight = 40;
  const pad = (height - itemHeight) / 2; // 80px
  const keys = Object.keys(selections); // ['weight', 'reps']

  const [refs] = useState({});
  const scrollEndTimers = useRef({});
  const isProgrammaticScroll = useRef({});
  const isScrolling = useRef({});

  const scrollToIndex = (key, idx, behavior) => {
    const el = refs[key];
    if (!el) return;
    isProgrammaticScroll.current[key] = true;
    el.scrollTo({ top: idx * itemHeight, behavior });
    setTimeout(
      () => {
        isProgrammaticScroll.current[key] = false;
      },
      behavior === "smooth" ? 120 : 0
    );
  };

  const computeIndexFromScrollTop = (scrollTop) => {
    const center = scrollTop + height / 2;
    const raw = (center - pad - itemHeight / 2) / itemHeight;
    return Math.round(raw);
  };

  return (
    <div className="ios-picker-container w-full h-[200px] overflow-hidden relative">
      {/* Gradiente overlay */}
      <div
        className="absolute inset-0 pointer-events-none z-10"
        style={{
          background:
            "linear-gradient(to bottom, rgba(249,250,251,1) 0%, rgba(249,250,251,0) 30%, rgba(249,250,251,0) 70%, rgba(249,250,251,1) 100%)",
        }}
      />

      {/* Grid de 2 columnas */}
      <div className="grid grid-cols-2 h-[200px]">
        {keys.map((key) => {
          const options = selections[key] || [];
          const selectedIdx = findIndexForValue(options, value[key]);

          return (
            <div
              key={key}
              ref={(el) => {
                refs[key] = el;
              }}
              className="h-[200px] overflow-y-scroll no-scrollbar"
              style={{
                WebkitOverflowScrolling: "touch",
                overscrollBehavior: "contain",
                touchAction: "pan-y",
                overflowX: "hidden",
              }}
              onScroll={(e) => {
                if (isProgrammaticScroll.current[key]) return;
                const el = e.currentTarget;

                // Clear timer anterior
                const prev = scrollEndTimers.current[key];
                if (prev) clearTimeout(prev);

                // Nuevo timer para snap
                scrollEndTimers.current[key] = setTimeout(() => {
                  const idx = computeIndexFromScrollTop(el.scrollTop);
                  scrollToIndex(key, idx, "smooth");
                  onChange({ ...value, [key]: options[idx] });
                  isScrolling.current[key] = false;
                }, 50);
              }}
            >
              {/* Padding superior */}
              <div style={{ height: pad }} />

              {/* Items */}
              {options.map((option, idx) => {
                const selected = idx === selectedIdx;
                return (
                  <div
                    key={String(option)}
                    className={`flex items-center justify-center h-[40px] transition-all duration-75 select-none ${
                      selected
                        ? "text-black font-black text-2xl scale-110"
                        : "text-gray-300 font-medium text-lg"
                    }`}
                  >
                    {option}
                  </div>
                );
              })}

              {/* Padding inferior */}
              <div style={{ height: pad }} />
            </div>
          );
        })}
      </div>

      {/* Línea de selección */}
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-12 border-y border-black/5 pointer-events-none" />
    </div>
  );
}
```

**CSS necesario (para el picker):**

```css
.ios-picker-container {
  mask-image: linear-gradient(
    to bottom,
    transparent,
    black 40%,
    black 60%,
    transparent
  );
}

.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.no-scrollbar::-webkit-scrollbar {
  display: none;
}
```

**Uso del picker en el modal:**

```tsx
<div className="mb-10">
  <div className="flex justify-around mb-2 px-4">
    <span className="text-[10px] font-black text-gray-300 uppercase tracking-[0.2em]">
      Peso (kg)
    </span>
    <span className="text-[10px] font-black text-gray-300 uppercase tracking-[0.2em]">
      Reps
    </span>
  </div>

  <div
    className={`relative h-[200px] bg-gray-50 rounded-[24px] overflow-hidden border border-black/5 transition-all ${
      completedSets[activeSetIndex] && !isEditing
        ? "opacity-30 grayscale pointer-events-none scale-95"
        : "opacity-100 scale-100"
    }`}
  >
    <IOSPicker
      key={activeSetIndex}
      value={{
        weight: sets[activeSetIndex]?.weight || 0,
        reps: sets[activeSetIndex]?.reps || 0,
      }}
      onChange={(val) => updateCurrentSet(val)}
      selections={{
        weight: Array.from({ length: 401 }, (_, i) => i * 0.5), // 0-200kg en 0.5
        reps: Array.from({ length: 31 }, (_, i) => i), // 0-30 reps
      }}
    />
    {/* Línea de selección */}
    <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-12 border-y border-black/5 pointer-events-none" />
  </div>
</div>
```

#### 8. Botón de Acción (Registrar/Guardar)

**Estados del botón:**

1. **Botón "Registrar Serie X" (estado normal):**

   - Background: `bg-ios-blue text-white`
   - Sombra: `shadow-xl shadow-ios-blue/20`
   - Width: `w-full`
   - Padding: `py-6` (24px vertical)
   - Border-radius: `rounded-[24px]`
   - Font: `font-black text-sm uppercase tracking-[0.2em]`
   - Active state: `active:scale-[0.98]`

2. **Botón "Guardar Cambios" (estado edición):**

   - Background: `bg-black text-white`
   - Sombra: `shadow-xl shadow-black/20`
   - Ícono: Check (lucide-react, size 18, strokeWidth 3)
   - Layout: Flex items-center justify-center gap-3

3. **Botón "Editar Serie X" (cuando está completado):**
   - Background: `bg-gray-100 text-black`
   - Border: `border border-black/5`
   - Layout: Flex items-center justify-center gap-3

**Código de ejemplo:**

```tsx
<div className="flex flex-col gap-3">
  {completedSets[activeSetIndex] && !isEditing ? (
    <button
      onClick={() => setIsEditing(true)}
      className="w-full py-5 rounded-[24px] font-black text-sm uppercase tracking-[0.2em] bg-gray-100 text-black active:scale-[0.98] transition-all flex items-center justify-center gap-3 border border-black/5"
    >
      Editar Serie {activeSetIndex + 1}
    </button>
  ) : (
    <button
      onClick={handleRegistration}
      className={`w-full py-6 rounded-[24px] font-black text-sm uppercase tracking-[0.2em] shadow-xl active:scale-[0.98] transition-all flex items-center justify-center gap-3 ${
        isEditing
          ? "bg-black text-white shadow-black/20"
          : "bg-ios-blue text-white shadow-ios-blue/20"
      }`}
    >
      {isEditing ? (
        <>
          <Check size={18} strokeWidth={3} />
          Guardar Cambios
        </>
      ) : (
        <>Registrar Serie {activeSetIndex + 1}</>
      )}
    </button>
  )}
</div>
```

#### 9. Texto de ayuda inferior

**Diseño:**

- Texto: "Desliza hacia abajo para cerrar y finalizar"
- Estilo: `text-center text-ios-gray/40 text-[9px] font-black uppercase tracking-[0.2em]`
- Margin: `mt-8` (32px arriba)

**Código de ejemplo:**

```tsx
<p className="text-center text-ios-gray/40 text-[9px] font-black uppercase tracking-[0.2em] mt-8">
  Desliza hacia abajo para cerrar y finalizar
</p>
```

### Ejemplo Completo del Modal

**Contenido de ejemplo para mostrar en el mock:**

- **Ejercicio:** "PRESS BANCA"
- **Series prescritas:** "3 x 8-12"
- **PR:** "80kg x 10" (mostrar en la sección azul destacada)
- **Serie activa:** Serie 1 (tab negro)
- **Peso seleccionado:** 75kg
- **Reps seleccionadas:** 10
- **Otras series:** Opcionalmente mostrar Serie 2 y Serie 3 (tabs grises o verdes si están completadas)

### Especificaciones Técnicas del Mock 2

**Dimensiones recomendadas:**

- Width: Mismo ancho que el mock 1 (400px-480px en desktop, full width en mobile)
- Height: Variable según contenido, pero mostrar al menos hasta el picker completamente visible

**Estado a mostrar:**

- Modal completamente abierto (y: 0)
- Backdrop visible pero puede ser más sutil para la landing (opcional: reducir opacidad o quitar blur)
- Todos los elementos visibles y legibles

**Animación (opcional en la landing):**

- Puede estar estático (ya abierto)
- O puede tener animación de entrada si es interactivo

### Notas de Implementación - Mock 2 (Modal de Ejercicio)

**Para el desarrollador/diseñador:**

1. **Fidelidad absoluta:** El modal debe ser idéntico al de la app real, usando exactamente los mismos estilos

2. **Selector iOS:** El picker es el elemento más distintivo. Debe funcionar correctamente (scroll, snap, gradiente)

3. **Sección PR:** Asegurar que la sección de Record Personal sea prominente y visible

4. **Responsive:** El modal debe adaptarse bien a diferentes tamaños de pantalla

5. **Interactividad (opcional):** Si quieres que sea completamente interactivo en la landing, implementa toda la lógica del picker

6. **Estado estático (alternativa):** Si prefieres mostrar un estado estático, muestra el modal abierto con valores de ejemplo fijos

---

### 2. Sección de Características Principales

**Objetivo:** Explicar funcionalidades clave de forma visual y concisa

**Título de Sección:**

- "Todo lo que necesitas para seguir tu progreso"
- font-extrabold, text-3xl o text-4xl, centrado

**Grid de Características (3-4 columnas en desktop, 1 en mobile):**

Cada feature card debe tener:

- **Icono:** Usar iconos de lucide-react o similar, tamaño 48px, color ios-blue
- **Título:** font-bold, text-xl
- **Descripción:** text-sm o text-base, color ios-gray, font-medium
- **Card Container:** bg-white, rounded-ios-xl, shadow-ios, border border-black/5, padding p-6

**Features a destacar:**

1. **"Rutinas Semanales"**

   - Icono: Calendar
   - Descripción: "Organiza tu entrenamiento por semanas y días. Navega entre ejercicios con gestos intuitivos"

2. **"Progreso Visual"**

   - Icono: LineChart o TrendingUp
   - Descripción: "Rastrea récords personales, series completadas y visualiza tu evolución"

3. **"Sincronización con Sheets"**

   - Icono: Database o Sheet
   - Descripción: "Tus datos viven en Google Sheets. Acceso completo, control total, siempre actualizado"

4. **"Análisis de Fatiga"**
   - Icono: Activity o Zap
   - Descripción: "Monitorea el volumen de entrenamiento por grupo muscular para optimizar tu recuperación"

**Espaciado:**

- Gap entre cards: 24px
- Padding vertical de sección: py-16 o py-20

---

### 3. Sección de Demostración Visual / Showcase

**Objetivo:** Mostrar la experiencia real de la aplicación

**Opciones de diseño:**

**Opción A: Mockup Interactivo**

- Imagen grande del stack de cards en acción
- Mostrar la animación de rotación de cards (puede ser un GIF o video loop)
- Fondo degradado sutil o patrón geométrico muy sutil

**Opción B: Capturas de Pantalla en Dispositivo**

- Mostrar 2-3 pantallas clave:
  1. Vista del stack de ejercicios (HomeScreen)
  2. Modal de ejercicio con registro de series
  3. Pantalla de progreso con PRs
- Disposición: Slider horizontal o grid
- Frames de iPhone/MacBook con sombras sutiles

**Elementos visuales:**

- Cards con rounded-ios-xl
- Sombras suaves (shadow-ios)
- Bordes sutiles (border-black/5)
- Colores de la paleta iOS

**Texto acompañante:**

- Título: "Diseño pensado para fluir"
- Subtítulo: "Navega tus ejercicios con gestos naturales. Registra tu progreso sin fricción"

---

### 4. Sección de Beneficios / Por Qué Elegir Gym Tracker

**Objetivo:** Comunicar diferenciadores y beneficios emocionales

**Formato:** Lista vertical o grid de 2 columnas

Cada beneficio:

- **Título:** font-bold, text-lg
- **Descripción:** text-base, color ios-gray
- **Icono opcional:** Pequeño, color ios-blue

**Beneficios clave:**

1. **"Sin suscripciones ocultas"**

   - Tu data vive en Google Sheets, eres dueño de tu información

2. **"Interfaz minimalista"**

   - Sin distracciones, enfocado en lo que importa: tu entrenamiento

3. **"Sincronización instantánea"**

   - Cambios en tiempo real entre dispositivos

4. **"Organización profesional"**
   - Sistema de semanas y días para planificación seria

---

### 5. Call to Action Final

**Objetivo:** Convertir visitantes en usuarios

**Diseño:**

- Fondo destacado: Puede ser ios-blue con texto blanco, o fondo blanco con borde ios-blue
- Contenedor: rounded-ios-xl, padding generoso (p-12)
- Título: font-extrabold, text-3xl
- Descripción: text-lg, font-medium
- Botón CTA: Grande, destacado, mismo estilo del hero

**Texto sugerido:**

- Título: "Comienza a seguir tu progreso hoy"
- Descripción: "Conecta tu Google Sheet y transforma tu rutina en una experiencia visual"
- CTA: "Empezar ahora" (botón ios-blue, texto blanco)

---

### 6. Footer

**Elementos:**

- Links: Sobre, Características, Contacto (si aplica)
- Copyright
- Estilo: Minimalista, texto pequeño, color ios-gray
- Fondo: Blanco o ios-background

---

## Principios de Diseño Específicos

### Animaciones y Transiciones

- **Sutiles y fluidas:** Usar framer-motion para animaciones suaves
- **Duración:** 300-500ms para transiciones
- **Easing:** ease-in-out o spring animations
- **Hover states:** Elevación sutil en cards, cambio de color en botones (opacity o background)

### Espaciado y Layout

- **Contenedor máximo:** 1200px o 1280px, centrado
- **Padding horizontal:** 24px en mobile, 48px en desktop
- **Vertical rhythm:** Espaciado consistente entre secciones (múltiplos de 16px o 24px)

### Responsive Design

- **Mobile-first approach**
- Breakpoints: 640px (sm), 768px (md), 1024px (lg), 1280px (xl)
- En mobile: Stack vertical, padding reducido
- En desktop: Grids de múltiples columnas, espaciado más generoso

### Interactividad

- **Botones:** Estados hover y active claros
- **Cards:** Elevación sutil en hover (shadow más pronunciada)
- **Links:** Color ios-blue, underline en hover (opcional)
- **Microinteracciones:** Feedback visual inmediato

---

## Elementos Visuales Específicos

### Badges y Etiquetas

- Fondo: ios-blue con opacidad baja (bg-ios-blue/10) o fondo blanco
- Texto: Uppercase, font-bold, text-[10px] o text-xs, tracking-wider
- Border-radius: rounded-full o rounded-lg

### Tipografía en Detalle

- **Headlines H1:** text-5xl o text-6xl, font-black, tracking-tight
- **Headlines H2:** text-3xl o text-4xl, font-extrabold
- **Headlines H3:** text-2xl, font-bold
- **Body text:** text-base (16px), font-medium o regular
- **Small text:** text-sm, font-medium
- **Micro text (labels):** text-[10px] o text-xs, font-bold, uppercase, tracking-wider

### Cards y Contenedores

- Fondo: bg-white
- Border-radius: rounded-ios-xl (20px) para cards principales
- Sombra: shadow-ios
- Borde: border border-black/5
- Padding: p-6 mínimo

---

## Tono y Lenguaje

### Voz

- **Directa pero amigable**
- **Profesional sin ser corporativa**
- **Conciso:** Cada palabra cuenta
- **Accionable:** Lenguaje que inspire acción

### Ejemplos de copy:

- Headlines: "Entrenamiento inteligente, sin complicaciones"
- CTAs: "Comenzar ahora", "Probar gratis", "Conectar mi Sheet"
- Descriptions: Frases cortas, puntos claros, sin jerga técnica innecesaria

---

## Tecnologías Sugeridas (para referencia del desarrollador)

- **Framework:** Next.js (coincide con la app)
- **Styling:** Tailwind CSS con configuración personalizada iOS
- **Animaciones:** Framer Motion
- **Tipografía:** System fonts (no requiere carga externa)
- **Iconos:** Lucide React (coincide con la app)

---

## Checklist de Elementos Clave

- [ ] Hero con headline claro y CTA destacado
- [ ] Sección de características con iconos y descripciones
- [ ] Mockup o showcase visual de la app
- [ ] Sección de beneficios/diferenciadores
- [ ] CTA final antes del footer
- [ ] Footer minimalista
- [ ] Paleta de colores iOS consistente
- [ ] Tipografía system fonts
- [ ] Sombras suaves (shadow-ios)
- [ ] Bordes redondeados (rounded-ios-xl para cards)
- [ ] Espaciado generoso y consistente
- [ ] Diseño responsive (mobile-first)
- [ ] Animaciones sutiles y fluidas
- [ ] Estados hover/interactivos claros

---

## Notas Finales

La landing debe sentirse como una extensión natural de la aplicación: misma filosofía de diseño, mismos colores, misma sensación de elegancia y simplicidad. El usuario debe ver la landing y pensar "esto es exactamente el tipo de experiencia que quiero en mi app de entrenamiento".

El objetivo es generar confianza y deseo de probar la aplicación, comunicando claramente que Gym Tracker es diferente: no es otra app genérica de fitness, es una herramienta profesional con un diseño que realmente importa.
