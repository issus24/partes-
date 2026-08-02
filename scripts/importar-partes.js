#!/usr/bin/env node
/* ============================================================
   Importador de los partes diarios (CSV) al modelo de la app.

       node scripts/importar-partes.js              informe, no toca nada
       node scripts/importar-partes.js --escribir   vuelca en datos/datos.json

   Los CSV son exportaciones de la planilla del taller: un archivo por
   día, con el encabezado cambiando de nombre cada tanto y con restos de
   partes viejos pegados más abajo en la misma hoja. Acá se los lee a
   todos, se los ordena por fecha y se reconstruye, para cada patente, la
   secuencia de estadías: cuándo entró al taller y cuándo salió.
   ============================================================ */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = path.join(__dirname, '..');
const DIR_CSV = path.join(RAIZ, 'partes_por_dia_2026');
const DESTINO = path.join(RAIZ, 'datos', 'datos.json');

/* ==================================================================
   Catálogos de la app

   ESTADOS y las categorías de problemas viven en public/core.js y son la
   única fuente de verdad. Se los carga de ahí en vez de copiarlos, así
   agregar una palabra clave al detector no obliga a tocar este archivo.
   core.js está escrito para el navegador: se lo evalúa con lo mínimo
   simulado para que no explote al arrancar.
   ================================================================== */

const DE_CORE = ['ESTADOS', 'detectarCategoria', 'normalizarPatente', 'enMinuscula'];

function cargarCore() {
  const codigo = fs.readFileSync(path.join(RAIZ, 'public', 'core.js'), 'utf8');
  const contexto = {
    console,
    location: { protocol: 'file:' },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    window: { addEventListener() {} },
  };
  vm.createContext(contexto);
  // Lo que core.js declara con const queda en su propio ámbito, no en el
  // contexto: hay que pedírselo explícitamente antes de que termine.
  vm.runInContext(`${codigo}\n;globalThis.__core = { ${DE_CORE.join(', ')} };`,
    contexto, { filename: 'core.js' });
  return contexto.__core;
}

const core = cargarCore();
const { ESTADOS, detectarCategoria, normalizarPatente, enMinuscula } = core;

/* ==================================================================
   Lectura del CSV
   ================================================================== */

function parsearCSV(txt) {
  txt = txt.replace(/^﻿/, '');
  const filas = [];
  let fila = [], campo = '', comillas = false;

  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (comillas) {
      if (c !== '"') { campo += c; continue; }
      if (txt[i + 1] === '"') { campo += '"'; i++; } else comillas = false;
    } else if (c === '"') comillas = true;
    else if (c === ',') { fila.push(campo); campo = ''; }
    else if (c === '\n') { fila.push(campo); filas.push(fila); fila = []; campo = ''; }
    else if (c !== '\r') campo += c;
  }
  if (campo || fila.length) { fila.push(campo); filas.push(fila); }
  return filas;
}

const celda = (fila, i) => (i == null ? '' : String(fila[i] ?? '').trim());
const filaVacia = fila => fila.every(c => !String(c).trim());

/* ------------------------------------------------------------------
   Dónde está cada dato

   El encabezado cambió de nombre seis veces entre marzo y agosto
   ("Patente" pasó a "UNIDAD", "Fecha Ingreso" a "F-I") y en trece
   archivos se exportó sin nombres, como "Column 1..14". Pero las
   columnas nunca se movieron de lugar: se busca por nombre y, si no
   aparece, se cae a la posición de siempre.
   ------------------------------------------------------------------ */

const CAMPOS = [
  ['id',            /^(id|fecha|n[º°]|column 1)$/,            0],
  ['patente',       /^(patente|unidad)$/,                     1],
  ['detalle',       /^(detalle|novedades)$/,                  2],
  ['observaciones', /^observaci/,                             5],
  ['estado',        /^estado$/,                               6],
  ['negligencia',   /^(negl\.?|negligencia)$/,                7],
  ['ingreso',       /^(fecha ingreso|fecha inicio|f-i)$/,     8],
  ['salida',        /^(fecha\s+salida|fecha de termino|f-t)$/, 13],
];

function mapearColumnas(encabezado) {
  const nombres = encabezado.map(c => String(c).trim().toLowerCase().replace(/\s+/g, ' '));
  const mapa = {};
  const porNombre = new Set();

  for (const [campo, patron] of CAMPOS) {
    const i = nombres.findIndex(n => patron.test(n));
    if (i >= 0) { mapa[campo] = i; porNombre.add(i); }
  }

  /* La posición de respaldo solo vale si nadie la reclamó por nombre. En
     los partes de fin de julio la columna 8 se llama OBSERVACIONES, y sin
     esta guarda "negligencia" — que no aparece en ese encabezado — se la
     quedaría igual por descarte. */
  for (const [campo, , defecto] of CAMPOS) {
    if (campo in mapa) continue;
    mapa[campo] = porNombre.has(defecto) ? null : defecto;
  }
  return mapa;
}

/* En los partes de marzo hay una columna sin nombre con el sector que se
   hizo cargo. Es la única pista firme sobre la categoría del problema, así
   que cuando está se le gana al detector por palabras clave. */
const SECTORES_CSV = [
  [/^elec/,  'electrico'],
  [/^her/,   'herreria'],
  [/^mec/,   'mecanico'],
  [/^gom/,   'gomeria'],
];

function categoriaDeSector(txt) {
  const t = String(txt || '').trim().toLowerCase();
  if (!t) return '';
  // "MEC/GOME" y "ELEC/ MEC": con dos sectores no se puede elegir, decide el texto.
  if (t.includes('/')) return '';
  return SECTORES_CSV.find(([p]) => p.test(t))?.[1] || '';
}

/* ------------------------------------------------------------------
   Qué filas son el parte del día

   Cada hoja arrastra partes viejos: en los archivos de marzo hay veinte
   bloques de 2025 colgando abajo, y en los de abril el mismo bloque
   repetido diez veces. El parte del día son los bloques de arriba,
   separados entre sí por una o dos filas en blanco. La basura vieja está
   siempre después de un hueco enorme — cientos de filas vacías — así que
   el corte es por tamaño del hueco.
   ------------------------------------------------------------------ */

const HUECO_MAXIMO = 10;

function filasDelParte(filas, desde) {
  const salida = [];
  let i = desde, finAnterior = desde;

  while (i < filas.length) {
    while (i < filas.length && filaVacia(filas[i])) i++;
    if (i >= filas.length) break;
    if (i - finAnterior > HUECO_MAXIMO) break;      // de acá para abajo es historia vieja

    while (i < filas.length && !filaVacia(filas[i])) salida.push(filas[i++]);
    finAnterior = i;
  }
  return salida;
}

/* ------------------------------------------------------------------
   Fechas y estados
   ------------------------------------------------------------------ */

/* Las fechas vienen casi siempre como "2026-07-02 00:00:00", pero hay
   sueltas escritas a mano ("24/062026"). Las columnas de fecha de los
   partes viejos traen horas ("11:55:00"): eso no es una fecha y se ignora. */
function aISO(txt) {
  const t = String(txt || '').trim();
  if (!t) return null;

  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  m = t.match(/^(\d{1,2})\/(\d{1,2})\/?(\d{4}|\d{2})$/);
  if (m) {
    const [, d, mes, a] = m;
    const anio = a.length === 2 ? `20${a}` : a;
    return `${anio}-${mes.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  // "24/062026" — se comió la barra del medio
  m = t.match(/^(\d{1,2})\/(\d{2})(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1].padStart(2, '0')}`;

  return null;
}

const sinAcentos = s => String(s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '');
const clave = s => sinAcentos(s).toUpperCase().replace(/[^A-Z]/g, '');

/* El mismo estado escrito de cuatro formas: "PENDIENTE DE INGRESO",
   "PEND  ING", "PEND ING". Se compara sin acentos, sin espacios y sin
   puntos, así que las variantes colapsan solas. */
const ESTADOS_CSV = {
  PENDIENTE: 'pendiente',
  PEND: 'pendiente',
  OPERATIVO: 'operativo',
  OPE: 'operativo',
  ALAESPERADEREPUESTOS: 'repuestos',
  ESPRES: 'repuestos',
  ESPERAREPUESTOS: 'repuestos',
  PENDIENTEDEINGRESO: 'ingreso',
  PENDING: 'ingreso',
  // "CITADO" es una unidad a la que se le dio hora para que venga:
  // todavía no entró al taller, igual que pendiente de ingreso.
  CITADO: 'ingreso',
  TALLERESEXTERNOS: 'externo',
  TEXT: 'externo',
  TALLEREXTERNO: 'externo',
};

const ID_ESTADOS = new Set(ESTADOS.map(e => e.id));

/* ------------------------------------------------------------------
   Patentes

   Vienen con y sin espacios ("AF948RW" y "CQD 623") y algunas arrastran
   la operación entre paréntesis ("NTB 607 (REFINOR)"). Se limpia el
   paréntesis antes de normalizar.

   Las que no quedan en 6 o 7 caracteres igual entran: "AE2871JU" tiene
   un dígito de más, pero es una unidad real que figura en ocho partes
   seguidos con su fecha de ingreso, y perderla sale más caro que
   importarla mal escrita — desde la app se corrige en diez segundos.
   El informe las lista aparte. Lo que no tiene ningún número no es una
   patente ("STOCK", encabezados sueltos) y eso sí se descarta.
   ------------------------------------------------------------------ */

const patenteDudosa = p => p.length !== 6 && p.length !== 7;

function limpiarPatente(txt) {
  const sinParentesis = String(txt || '').replace(/\([^)]*\)/g, ' ');
  const p = normalizarPatente(sinParentesis);
  if (p.length < 5 || p.length > 9) return null;
  if (!/\d/.test(p) || !/[A-Z]/.test(p)) return null;
  return p;
}

/* ==================================================================
   Lectura de todos los partes
   ================================================================== */

function leerParte(archivo) {
  const fecha = path.basename(archivo, '.csv');
  const filas = parsearCSV(fs.readFileSync(path.join(DIR_CSV, archivo), 'utf8'));

  let iHead = filas.findIndex(f => /^(id|fecha|n[º°]|column 1)$/i.test(celda(f, 0)));
  if (iHead < 0) iHead = 0;
  const col = mapearColumnas(filas[iHead]);

  const items = [];
  const rechazos = [];

  for (const fila of filasDelParte(filas, iHead + 1)) {
    const crudo = celda(fila, col.patente);
    if (!crudo) continue;

    const patente = limpiarPatente(crudo);
    if (!patente) { rechazos.push(crudo); continue; }

    const estadoCrudo = celda(fila, col.estado);
    const estado = ESTADOS_CSV[clave(estadoCrudo)] || null;

    items.push({
      fecha,
      patente,
      detalle: celda(fila, col.detalle),
      observaciones: celda(fila, col.observaciones),
      estado,
      // Un estado que no está en el catálogo casi siempre es una
      // observación escrita en la columna equivocada: no se pierde.
      estadoRaro: !estado && estadoCrudo ? estadoCrudo : '',
      negligencia: !!celda(fila, col.negligencia).match(/^x$/i),
      ingreso: aISO(celda(fila, col.ingreso)),
      salida: aISO(celda(fila, col.salida)),
      categoriaSector: categoriaDeSector(celda(fila, 11)),
    });
  }

  return { fecha, items, rechazos };
}

/* ==================================================================
   De filas sueltas a estadías

   Un parte es una foto del día: dice qué unidades están en el taller y
   cómo vienen. La estadía hay que deducirla de la serie.

     · La entrada sale de la columna F-I cuando está cargada. Antes del
       18/6 esa columna no existía, así que se toma el primer día en que
       la patente aparece en los partes.
     · La salida sale de F-T. Si está vacía, es el día en que el parte la
       muestra OPERATIVO — que es lo que en el taller significa que se fue.
     · Si vuelve a aparecer después de haber salido, o con una fecha de
       ingreso distinta a la de la estadía abierta, es una visita nueva.
   ================================================================== */

const correrDia = (iso, n) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
const diaAnterior = iso => correrDia(iso, -1);

/* Una fecha de ingreso no puede meterse dentro de la visita anterior.
   Pasa cuando el F-I se retro-edita meses para atrás a mitad de estadía
   (NDE808 lo cambió de 07/07 a 15/04 el 24 de julio): sin este piso, la
   visita nueva se traga a la vieja y la unidad queda dos veces en el
   taller el mismo día. */
function conPiso(estadias, propuesto) {
  const previa = estadias[estadias.length - 1];
  if (!previa?.finalizado) return propuesto;
  const piso = correrDia(previa.finalizado, 1);
  return propuesto < piso ? piso : propuesto;
}

function armarEstadias(dias) {
  const estadias = [];
  let abierta = null;

  for (const dia of dias) {
    const declarado = dia.ingreso;

    /* Una unidad que ya se fue y sigue figurando OPERATIVO en los partes
       de los días siguientes no volvió a entrar: es la misma salida
       arrastrada en la planilla. Sin esta guarda cada día de arrastre
       abriría una estadía de un día. */
    if (!abierta && dia.estado === 'operativo') {
      const ultima = estadias[estadias.length - 1];
      const mismaVisita = ultima && (
        (declarado && declarado === ultima.ingreso) ||
        (!declarado && ultima.finalizado)
      );
      if (mismaVisita) continue;
    }

    /* La fecha de ingreso aparece con días de atraso: la unidad entra el
       6, el parte del 7 la lista sin fecha y recién el del 8 le carga
       "F-I 06/07". Esa fecha anterior a lo que veníamos suponiendo es la
       misma visita mejor fechada, no una nueva — se corrige el ingreso.
       Una fecha POSTERIOR sí es una entrada nueva: la unidad volvió. */
    if (abierta && declarado && declarado !== abierta.ingreso) {
      if (declarado < abierta.ingreso) {
        abierta.ingreso = conPiso(estadias.slice(0, -1), declarado);
      } else {
        // La visita anterior termina el día antes de que empiece la nueva,
        // así ninguna unidad queda dos veces en el taller el mismo día.
        const cierre = declarado <= abierta.ultimoDia ? diaAnterior(declarado) : abierta.ultimoDia;
        cerrar(abierta, cierre);
        abierta = null;
      }
    }

    /* Vuelve a figurar pendiente después de haberla dado por operativa,
       pero con la misma fecha de ingreso: no volvió a entrar, es que la
       salida anterior fue prematura. La fecha declarada manda, así que se
       reabre la misma visita en lugar de inventar otra. */
    if (!abierta && declarado) {
      const ultima = estadias[estadias.length - 1];
      if (ultima && ultima.ingreso === declarado) {
        abierta = ultima;
        abierta.finalizado = null;
      }
    }

    if (!abierta) {
      abierta = {
        id: '',
        ingreso: conPiso(estadias, declarado || dia.fecha),
        finalizado: null,
        estado: 'pendiente',
        problemas: [],
        pedidos: [],
        updates: {},
        ultimoDia: dia.fecha,
        negligencia: false,
      };
      estadias.push(abierta);
    }

    abierta.ultimoDia = dia.fecha;
    if (dia.estado) abierta.estado = dia.estado;
    if (dia.negligencia) abierta.negligencia = true;

    for (const p of dia.problemas) sumarProblema(abierta, p);
    sumarUpdates(abierta, dia);

    if (dia.salida) { cerrar(abierta, dia.salida); abierta = null; }
    else if (dia.estado === 'operativo') { cerrar(abierta, dia.fecha); abierta = null; }
  }

  return estadias;
}

/* ------------------------------------------------------------------
   Estadías que el parte dejó colgadas

   Una unidad que se fue del taller y a la que nunca le marcaron
   OPERATIVO queda abierta para siempre, y la app le cuenta los días
   hasta hoy: había unas cuantas con 129 días. No siguieron cuatro meses
   en el taller, dejaron de cargarlas.

   Se dan por cerradas el último día que figuraron. El umbral es
   deliberadamente holgado: el parte se saltea domingos y feriados, y una
   unidad puede faltar unos días por un olvido de carga y seguir en el
   taller. Recién cuando pasan dos semanas sin figurar no hay forma de
   sostener que sigue adentro.

   Quedan como operativas porque el modelo no da otra: finalizado y
   operativo van juntos. Es una inferencia nuestra, no algo que diga el
   parte.
   ------------------------------------------------------------------ */

const DIAS_PARA_DARLA_POR_IDA = 14;

function cerrarLasColgadas(estadias, ultimoParte) {
  let n = 0;
  for (const e of estadias) {
    if (e.finalizado || diffDias(e.ultimoDia, ultimoParte) <= DIAS_PARA_DARLA_POR_IDA) continue;
    cerrar(e, e.ultimoDia);
    n++;
  }
  return n;
}

/* core.js exige que una estadía operativa tenga fecha de cierre y que
   ninguna otra la tenga (migrar() lo corrige al cargar). Se respeta acá. */
function cerrar(e, fecha) {
  e.estado = 'operativo';
  e.finalizado = fecha < e.ingreso ? e.ingreso : fecha;
}

/* El detalle se repite igual todos los días que la unidad sigue en el
   taller: es el mismo problema, no uno nuevo. */
function sumarProblema(e, { texto, categoria }) {
  const t = enMinuscula(texto);
  if (!t) return;
  if (e.problemas.some(p => p.texto === t)) return;
  e.problemas.push({
    texto: t,
    categoria: categoria || detectarCategoria(t),
    manual: !!categoria,
  });
}

/* Las observaciones también se arrastran de un día al otro, y con dos
   filas por unidad el arrastre alterna entre dos textos. Se anota cada
   texto una sola vez por estadía, el día que apareció.

   El operario va vacío a propósito. La columna Responsable de la planilla
   trae nombres, pero son de quien firmó el parte, no necesariamente de
   quien hizo el trabajo: ponerlos ahí seria atribuirle a alguien una
   reparación que capaz no tocó. Se carga a mano desde la app. */
function sumarUpdates(e, dia) {
  e._vistos ||= new Set();
  for (const u of dia.updates) {
    const texto = enMinuscula(u.texto);
    if (!texto || e._vistos.has(texto)) continue;
    e._vistos.add(texto);
    (e.updates[dia.fecha] ||= []).push({ sector: 'taller', texto, operario: '' });
  }
}

/* ------------------------------------------------------------------
   Varias filas de la misma patente en un mismo parte son varios
   problemas de la misma visita: se juntan en un solo día.
   ------------------------------------------------------------------ */

function agruparPorDia(items) {
  const porDia = new Map();

  for (const it of items) {
    let d = porDia.get(it.fecha);
    if (!d) {
      d = { fecha: it.fecha, estado: null, ingreso: null, salida: null,
            negligencia: false, problemas: [], updates: [] };
      porDia.set(it.fecha, d);
    }

    /* Si una fila la da operativa y otra no, la unidad sigue en el
       taller: manda la que no está terminada. */
    if (it.estado && (!d.estado || d.estado === 'operativo')) d.estado = it.estado;

    d.ingreso ||= it.ingreso;
    d.salida ||= it.salida;
    d.negligencia ||= it.negligencia;

    if (it.detalle) d.problemas.push({ texto: it.detalle, categoria: it.categoriaSector });
    for (const texto of [it.observaciones, it.estadoRaro]) {
      if (texto) d.updates.push({ texto });
    }
  }

  return [...porDia.values()].sort((a, b) => a.fecha.localeCompare(b.fecha));
}

/* ==================================================================
   Programa
   ================================================================== */

function importar() {
  const archivos = fs.readdirSync(DIR_CSV).filter(f => f.endsWith('.csv')).sort();
  if (!archivos.length) throw new Error(`No hay CSV en ${DIR_CSV}`);

  const porPatente = new Map();
  const rechazos = new Map();
  const estadosRaros = new Map();
  let filasLeidas = 0;

  for (const archivo of archivos) {
    const parte = leerParte(archivo);
    filasLeidas += parte.items.length;

    for (const r of parte.rechazos) rechazos.set(r, (rechazos.get(r) || 0) + 1);
    for (const it of parte.items) {
      if (it.estadoRaro) estadosRaros.set(it.estadoRaro, (estadosRaros.get(it.estadoRaro) || 0) + 1);
      if (!porPatente.has(it.patente)) porPatente.set(it.patente, []);
      porPatente.get(it.patente).push(it);
    }
  }

  const ultimoParte = archivos[archivos.length - 1].replace('.csv', '');

  const vehiculos = [];
  const dudosas = [];
  let colgadas = 0;
  for (const [patente, items] of [...porPatente].sort()) {
    if (patenteDudosa(patente)) dudosas.push(`${patente} (${items.length} filas)`);
    const estadias = armarEstadias(agruparPorDia(items));
    colgadas += cerrarLasColgadas(estadias, ultimoParte);
    for (const [i, e] of estadias.entries()) {
      e.id = `imp-${patente}-${i + 1}`;
      delete e._vistos;
      if (!e.negligencia) delete e.negligencia;
      if (!ID_ESTADOS.has(e.estado)) e.estado = 'pendiente';
    }
    vehiculos.push({
      id: `imp-${patente}`,
      patente,
      marca: '', modelo: '', chasis: '', motor: '',
      estadias,
    });
  }

  return { vehiculos, archivos, ultimoParte, filasLeidas, rechazos, estadosRaros, dudosas, colgadas };
}

const diffDias = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);

function informe({ vehiculos, archivos, ultimoParte, filasLeidas, rechazos, estadosRaros, dudosas, colgadas }) {
  const estadias = vehiculos.flatMap(v => v.estadias);
  const abiertas = estadias.filter(e => !e.finalizado);
  const cerradas = estadias.filter(e => e.finalizado);
  const promedio = cerradas.length
    ? (cerradas.reduce((n, e) => n + diffDias(e.ingreso, e.finalizado), 0) / cerradas.length).toFixed(1) : '—';

  const l = console.log;
  l(`\nPartes leídos      ${archivos.length}   (${archivos[0].replace('.csv', '')} → ${ultimoParte})`);
  l(`Filas del parte    ${filasLeidas}`);
  l(`Vehículos          ${vehiculos.length}`);
  l(`Estadías           ${estadias.length}   (${abiertas.length} abiertas, ${cerradas.length} cerradas)`);
  l(`Días en taller     ${promedio} promedio por estadía cerrada`);
  l(`Problemas          ${estadias.reduce((n, e) => n + e.problemas.length, 0)}`);
  l(`Novedades          ${estadias.reduce((n, e) => n + Object.keys(e.updates).length, 0)} días con texto`);

  /* Una estadía queda abierta cuando el parte nunca la dio por operativa.
     Las que además dejaron de figurar hace más de dos semanas ya se
     cerraron solas; el resto conviene tenerlo a la vista. */
  const enElUltimo = abiertas.filter(e => e.ultimoDia === ultimoParte);
  l(`\nDe las ${abiertas.length} estadías que quedan abiertas:`);
  l(`  ${enElUltimo.length} figuran todavía en el parte del ${ultimoParte}`);
  l(`  ${abiertas.length - enElUltimo.length} dejaron de figurar hace ${DIAS_PARA_DARLA_POR_IDA} días o menos`);
  l(`  ${colgadas} se cerraron el último día que figuraron (más de ${DIAS_PARA_DARLA_POR_IDA} días sin aparecer)`);

  /* Una unidad no puede estar dos veces en el taller el mismo día:
     estadiaEnFecha() se queda con la primera que encuentra y la grilla
     mostraría la visita equivocada. Si esto no da cero, hay un bug. */
  const solapadas = [];
  const cerradaAntesDeEntrar = [];
  for (const v of vehiculos) {
    const orden = [...v.estadias].sort((a, b) => a.ingreso.localeCompare(b.ingreso));
    for (const [i, e] of orden.entries()) {
      if (e.finalizado && e.finalizado < e.ingreso) cerradaAntesDeEntrar.push(v.patente);
      const sig = orden[i + 1];
      if (!sig) continue;
      if (!e.finalizado || sig.ingreso <= e.finalizado) solapadas.push(`${v.patente} ${e.ingreso}→${e.finalizado || 'abierta'} con ${sig.ingreso}`);
    }
  }
  l(`\nControles    estadías solapadas: ${solapadas.length}   salidas antes del ingreso: ${cerradaAntesDeEntrar.length}`);
  for (const s of solapadas.slice(0, 10)) l(`  ${s}`);

  const masVisitas = [...vehiculos].sort((a, b) => b.estadias.length - a.estadias.length).slice(0, 8);
  l('\nUnidades con más visitas:');
  for (const v of masVisitas) l(`  ${v.patente.padEnd(9)} ${String(v.estadias.length).padStart(2)} visitas`);

  if (dudosas.length) {
    l('\nPatentes con largo raro (se importan igual, conviene corregirlas en la app):');
    for (const d of dudosas) l(`  ${d}`);
  }
  if (rechazos.size) {
    l('\nDescartado por no parecer una patente:');
    for (const [p, n] of [...rechazos].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
      l(`  ${String(n).padStart(4)}×  ${p}`);
    }
  }
  if (estadosRaros.size) {
    l(`\nTextos en la columna Estado que no son un estado (${estadosRaros.size}); se guardaron como novedad:`);
    for (const [t, n] of [...estadosRaros].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
      l(`  ${String(n).padStart(4)}×  ${t.slice(0, 70)}`);
    }
  }
}

/* Auditoría de una unidad: para contrastar contra los CSV a mano. */
function detalle(vehiculos, patente) {
  const p = normalizarPatente(patente);
  const v = vehiculos.find(v => v.patente === p);
  if (!v) return console.log(`\nNo hay ninguna unidad con patente ${p}.`);

  console.log(`\n=== ${v.patente} — ${v.estadias.length} estadías ===`);
  for (const e of v.estadias) {
    const cierre = e.finalizado ? `salida ${e.finalizado} (${diffDias(e.ingreso, e.finalizado)} días)` : 'ABIERTA';
    console.log(`\n  ingreso ${e.ingreso} → ${cierre}   [${e.estado}]  último parte: ${e.ultimoDia}`);
    for (const pr of e.problemas) console.log(`     · ${pr.categoria.padEnd(10)} ${pr.texto.slice(0, 80)}`);
    for (const f of Object.keys(e.updates).sort()) {
      for (const u of e.updates[f]) console.log(`     ${f}  ${u.texto.slice(0, 70)}`);
    }
  }
}

function escribir(vehiculos) {
  for (const v of vehiculos) for (const e of v.estadias) delete e.ultimoDia;
  fs.mkdirSync(path.dirname(DESTINO), { recursive: true });

  if (fs.existsSync(DESTINO) && !process.argv.includes('--forzar')) {
    const actual = JSON.parse(fs.readFileSync(DESTINO, 'utf8'));
    if (actual.vehiculos?.length) {
      console.error(`\n${DESTINO} ya tiene ${actual.vehiculos.length} vehículos.`);
      console.error('Volvé a correrlo con --forzar si querés reemplazarlos.');
      process.exit(1);
    }
  }

  fs.writeFileSync(DESTINO, JSON.stringify({ vehiculos }, null, 2));
  console.log(`\nEscrito: ${DESTINO}`);
}

const resultado = importar();
informe(resultado);

const iDetalle = process.argv.indexOf('--detalle');
if (iDetalle >= 0) detalle(resultado.vehiculos, process.argv[iDetalle + 1] || '');

if (process.argv.includes('--escribir')) escribir(resultado.vehiculos);
else console.log('\n(informe solamente — agregá --escribir para volcarlo en datos/datos.json)');
