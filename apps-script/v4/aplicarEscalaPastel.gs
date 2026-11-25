/**
 * Instala la escala RPE/RIR en una copia de Rutina Gym v4.
 * Ejecutar aplicarEscalaPastel manualmente desde el editor vinculado.
 * Las reglas que se agregan escriben formato condicional en las celdas de esfuerzo.
 * El registro indica qué pestañas requieren revisar un solapamiento antes de continuar.
 *
 * @OnlyCurrentDoc
 */
function aplicarEscalaPastel() {
  const libro = SpreadsheetApp.getActiveSpreadsheet();
  if (!libro) throw new Error('Abrí el editor desde la planilla de la rutina.');

  const bloqueo = LockService.getDocumentLock();
  bloqueo.waitLock(5000);
  try {
    const nombres = ['dev1', 'dev2', 'dev3', 'dev4', 'atack1', 'Plantilla'];
    // Conserva la paleta del script original y completa sus valores desde Variables.
    const paleta = {
      '@5': '#D9EAD3',
      '@5.5': '#E8F5E3',
      '@6': '#D9EAD3',
      '@6.5': '#C5E1A5',
      '@7': '#FFF2CC',
      '@7.5': '#FCE5CD',
      '@8': '#F9CB9C',
      '@8.5': '#F4CCCC',
      '@9': '#E6B8AF',
      '@9.5': '#EA9999',
      'RIR 1': '#E6B8AF',
      'RIR 2': '#F9CB9C',
      'RIR 3': '#B6D7A8',
    };

    for (const nombre of nombres) {
      const hoja = libro.getSheetByName(nombre);
      if (!hoja) {
        console.warn(`${nombre}: pestaña ausente.`);
        continue;
      }
      instalarEscalaPastelEnHoja_(hoja, paleta);
    }
  } finally {
    try {
      SpreadsheetApp.flush();
    } finally {
      bloqueo.releaseLock();
    }
  }
}

function instalarEscalaPastelEnHoja_(hoja, paleta) {
  const nombre = hoja.getName();
  const filas = [2, 13, 24, 35];
  const columnas = ['C', 'G', 'K', 'O'];
  const encabezados = hoja.getMaxRows() >= 41 && hoja.getMaxColumns() >= 15
    ? hoja.getRange('A1:O35').getDisplayValues()
    : [];
  const estructuraConocida = filas.every((fila, dia) => {
    const encabezado = encabezados[fila - 1];
    return encabezado?.[0] === `DIA ${dia + 1}` && encabezado[1] === 'Movimiento'
      && (encabezado[2] === 'RPE/RIR' || (dia === 1 && encabezado[2] === ''))
      && [6, 10, 14].every(indice => encabezado[indice] === 'RPE/RIR');
  });
  if (!estructuraConocida) {
    console.warn(`${nombre}: cambió la ubicación de los datos de esfuerzo.`);
    return;
  }

  const direcciones = filas.flatMap(fila => columnas.map(columna =>
    `${columna}${fila + 1}:${columna}${fila + 6}`));
  const rangos = hoja.getRangeList(direcciones).getRanges();
  const claveRangos = direcciones.slice().sort().join(',');
  const reglas = hoja.getConditionalFormatRules();
  const criterios = SpreadsheetApp.BooleanCriteria;
  const entradasInstaladas = new Set();
  const zonas = rangos.map(limitesParaEscalaPastel_);

  for (const regla of reglas) {
    const rangosRegla = regla.getRanges();
    const seSolapa = rangosRegla.map(limitesParaEscalaPastel_).some(rango =>
      zonas.some(zona => rango.fila <= zona.ultimaFila && zona.fila <= rango.ultimaFila
        && rango.columna <= zona.ultimaColumna && zona.columna <= rango.ultimaColumna));
    if (!seSolapa) continue;

    const formato = leerFormatoParaEscalaPastel_(regla);
    if (formato) {
      const {tipo, texto, color, negrita} = formato;
      const rangosCoinciden = rangosRegla.map(rango => rango.getA1Notation())
        .sort().join(',') === claveRangos;
      if (tipo === criterios.TEXT_EQUAL_TO && rangosCoinciden
          && color === paleta[texto] && negrita === (texto.startsWith('@') ? true : null)) {
        entradasInstaladas.add(texto);
        continue;
      }

      // Conserva las reglas observadas para negrita y verde, incluida su prioridad entre sí.
      if (tipo === criterios.TEXT_CONTAINS && texto === '@' && color === null && negrita === true) {
        continue;
      }
      if ((tipo === criterios.TEXT_CONTAINS || tipo === criterios.TEXT_EQUAL_TO)
          && texto === '@5' && color === paleta['@5'] && negrita === null) {
        continue;
      }
    }

    console.warn(`${nombre}: una regla de formato existente se solapa con la escala. Revisá el formato condicional de esta pestaña.`);
    return;
  }

  const nuevas = Object.entries(paleta)
    .filter(([texto]) => !entradasInstaladas.has(texto))
    .map(([texto, color]) => {
      const regla = SpreadsheetApp.newConditionalFormatRule()
        .whenTextEqualTo(texto)
        .setBackground(color)
        .setRanges(rangos);
      if (texto.startsWith('@')) regla.setBold(true);
      return regla.build();
    });

  if (nuevas.length) hoja.setConditionalFormatRules(nuevas.concat(reglas));
  console.log(`${nombre}: ${nuevas.length} reglas agregadas.`);
}

function limitesParaEscalaPastel_(rango) {
  return {
    fila: rango.getRow(),
    ultimaFila: rango.getLastRow(),
    columna: rango.getColumn(),
    ultimaColumna: rango.getLastColumn(),
  };
}

function leerFormatoParaEscalaPastel_(regla) {
  const condicion = regla.getBooleanCondition();
  if (!condicion || condicion.getFontColorObject() || condicion.getItalic() !== null
      || condicion.getStrikethrough() !== null || condicion.getUnderline() !== null) return null;

  const fondo = condicion.getBackgroundObject();
  if (fondo && fondo.getColorType() !== SpreadsheetApp.ColorType.RGB) return null;

  const [texto] = condicion.getCriteriaValues();
  if (typeof texto !== 'string') return null;

  return {
    tipo: condicion.getCriteriaType(),
    texto,
    color: fondo ? fondo.asRgbColor().asHexString().toUpperCase() : null,
    negrita: condicion.getBold(),
  };
}
