/* ============================================================
   Parte de Trabajo — núcleo compartido
   Modelo de datos, catálogos y utilidades que usan tanto la vista
   de escritorio (app.js) como la vista móvil (movil.js).
   No toca el DOM: cargarlo antes que cualquiera de las dos.
   ============================================================ */

const STORAGE_KEY = 'parte-trabajo-v1';

/* ---------- Estados del vehículo ---------- */

const ESTADOS = [
  { id: 'pendiente', label: 'Pendiente',                 color: '#e0a92a' },
  { id: 'operativo', label: 'Operativo',                 color: '#2fae6b' },
  { id: 'repuestos', label: 'A la espera de repuestos',  color: '#3d8bfd' },
  { id: 'ingreso',   label: 'Pendiente de ingreso',      color: '#9b7ede' },
  { id: 'externo',   label: 'Taller externo',            color: '#e86ca8' },
];

const ESTADO_DEFECTO = 'pendiente';

/* Equivalencias con los estados de versiones anteriores. */
const ESTADOS_VIEJOS = {
  reparacion: 'pendiente',
  repuesto: 'repuestos',
  espera: 'ingreso',
  terminado: 'operativo',
  entregado: 'operativo',
};

const estadoPorId = id => ESTADOS.find(e => e.id === id) || ESTADOS[0];

/* ---------- Estados de un pedido de repuestos ---------- */

const ESTADOS_PEDIDO = [
  { id: 'solicitado', label: 'Solicitado', color: '#e0a92a' },
  { id: 'cotizando',  label: 'Cotizando',  color: '#4d9de0' },
  { id: 'aprobado',   label: 'Aprobado',   color: '#9b7ede' },
  { id: 'comprado',   label: 'Comprado',   color: '#59c3c3' },
  { id: 'recibido',   label: 'Recibido',   color: '#2fae6b' },
  { id: 'rechazado',  label: 'Rechazado',  color: '#e05c5c' },
];

const PEDIDO_DEFECTO = 'solicitado';
const PEDIDO_CERRADO = ['recibido', 'rechazado'];

const pedidoEstadoPorId = id => ESTADOS_PEDIDO.find(e => e.id === id) || ESTADOS_PEDIDO[0];

/* Pedidos que todavía esperan algo de compras. */
const pedidosAbiertos = v => (v.pedidos || []).filter(p => !PEDIDO_CERRADO.includes(p.estado));

/* ------------------------------------------------------------------
   Categorías de problemas.
   La detección es por palabras clave (sin acentos, en minúscula): se cuenta
   cuántas coincidencias tiene cada categoría y gana la que más suma. Siempre
   se puede corregir a mano desde el selector de cada fila.
   Para afinarla, agregá términos a "claves" — no hace falta tocar nada más.
   ------------------------------------------------------------------ */
const CATEGORIAS = [
  { id: 'mecanico', label: 'Mecánico', inicial: 'M', color: '#e8825c', claves: [
    // motor
    'motor', 'aceite', 'humo', 'hume', 'culata', 'junta', 'correa', 'distribucion',
    'bujia', 'inyector', 'inyeccion', 'arranc', 'ralenti', 'biela', 'ciguenal',
    'turbo', 'radiador', 'refrigerante', 'recalienta', 'temperatura', 'admision',
    'escape', 'catalizador', 'golpeteo', 'compresion', 'nafta', 'gasoil', 'combustible',
    // frenos
    'freno', 'pastilla', 'disco', 'campana', 'balata', 'cinta', 'abs', 'pedal',
    'cilindro maestro', 'servofreno', 'mordaza',
    // suspensión y dirección
    'suspension', 'amortiguador', 'espiral', 'elastico', 'rotula', 'extremo',
    'direccion', 'tren delantero', 'tren trasero', 'buje', 'alineacion', 'volante',
    'cremallera', 'puntero',
    // transmisión
    'caja', 'embrague', 'clutch', 'cardan', 'diferencial', 'transmision', 'marcha',
    'cambio', 'cruceta', 'semieje', 'palier', 'velocidad',
    // hidráulico y climatización
    'hidraulic', 'bomba', 'manguera', 'levante', 'piston', 'toma de fuerza',
    'aire acondicionado', 'climatiza', 'calefaccion', 'calefactor', 'compresor',
    'ventilacion', 'forzador', 'perdida', 'pierde', 'ruido', 'vibra'] },

  { id: 'electrico', label: 'Eléctrico', inicial: 'E', color: '#e0c23a', claves: [
    'electric', 'luz', 'luce', 'foco', 'faro', 'bateria', 'alternador', 'cable',
    'fusible', 'tablero', 'testigo', 'sensor', 'alarma', 'cerradura', 'bocina',
    'levantavidrio', 'limpiaparabrisas', 'baliza', 'giro', 'stop', 'burro',
    'corriente', 'no enciende', 'quemad', 'instalacion', 'rele', 'llave de luces',
    'tacografo', 'gps'] },

  { id: 'herreria', label: 'Herrería', inicial: 'H', color: '#4d9de0', claves: [
    'chapa', 'soldadura', 'soldar', 'rajad', 'fisura', 'quebrad', 'rotur',
    'estructura', 'chasis', 'baranda', 'caja de carga', 'guardabarro', 'paragolpe',
    'enganche', 'perno', 'soporte', 'travesaño', 'travesano', 'larguero', 'abolladura',
    'golpe', 'puerta', 'capot', 'oxido', 'pintura', 'refuerzo', 'bisagra', 'porton',
    'escalera', 'tanque'] },

  { id: 'gomeria', label: 'Gomería', inicial: 'G', color: '#59c39a', claves: [
    'neumatico', 'cubierta', 'goma', 'rueda', 'llanta', 'presion', 'pinchad',
    'auxilio', 'tuerca', 'valvula', 'camara', 'balanceo', 'desgaste', 'gomeria'] },
];

const CATEGORIA_DEFECTO = 'mecanico';

/* Equivalencias con las categorías de versiones anteriores. */
const CATEGORIAS_VIEJAS = {
  motor: 'mecanico', frenos: 'mecanico', suspension: 'mecanico',
  transmision: 'mecanico', hidraulico: 'mecanico', climatizacion: 'mecanico',
  otros: 'mecanico', carroceria: 'herreria', neumaticos: 'gomeria',
};

const categoriaPorId = id => CATEGORIAS.find(c => c.id === id) || CATEGORIAS[0];

const normalizar = s => String(s || '').toLowerCase()
  .normalize('NFD').replace(/\p{Diacritic}/gu, '');

function detectarCategoria(texto) {
  const t = normalizar(texto);
  if (!t.trim()) return '';
  let mejorId = CATEGORIA_DEFECTO, mejorPuntaje = 0;
  for (const c of CATEGORIAS) {
    const puntaje = c.claves.reduce((n, k) => n + (t.includes(k) ? 1 : 0), 0);
    if (puntaje > mejorPuntaje) { mejorPuntaje = puntaje; mejorId = c.id; }
  }
  return mejorId;
}

/* Sugerencias del campo "sector". Es texto libre: se pueden escribir otros. */
const SECTORES = ['Taller', 'Compras', 'Repuestos', 'Administración', 'Servicio externo', 'Jefatura'];

/* Cada sector conserva siempre el mismo color de barra, para reconocerlo de un vistazo. */
const COLORES_SECTOR = ['#4d9de0', '#e0a92a', '#59c39a', '#c98ae0', '#e8825c', '#7d8ce8', '#d9d05c'];

function colorSector(nombre) {
  if (!nombre) return '#3a4454';
  let h = 0;
  for (const c of nombre.toLowerCase().trim()) h = (h * 31 + c.charCodeAt(0)) % 100000;
  return COLORES_SECTOR[h % COLORES_SECTOR.length];
}

/* ---------- Fechas (ISO yyyy-mm-dd, sin husos horarios) ---------- */

const hoyISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function isoADate(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(a, m - 1, d);
}

function sumarDias(iso, n) {
  const d = isoADate(iso);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function diffDias(isoA, isoB) {
  return Math.round((isoADate(isoB) - isoADate(isoA)) / 86400000);
}

const NOMBRE_DIA = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const esFinde = iso => [0, 6].includes(isoADate(iso).getDay());
const fechaCorta = iso => { const [a, m, d] = iso.split('-'); return `${+d}/${+m}`; };
const fechaLarga = iso => {
  const d = isoADate(iso);
  return `${NOMBRE_DIA[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
};

/* "hoy", "ayer", "hace 3 días" */
function fechaRelativa(iso) {
  const n = diffDias(iso, hoyISO());
  if (n === 0) return 'hoy';
  if (n === 1) return 'ayer';
  if (n > 1) return `hace ${n} días`;
  if (n === -1) return 'mañana';
  return `en ${-n} días`;
}

/* ==================================================================
   Persistencia

   Hay dos modos y se eligen solos:

   · SERVIDOR — la app se abrió desde http(s), o sea que hay backend.
     Los cambios van a la API y todos los dispositivos ven lo mismo.
     localStorage queda como caché: la pantalla pinta al instante y
     sigue funcionando si el celular se queda sin señal.

   · LOCAL — la app se abrió con doble clic (file://). No hay servidor,
     así que todo vive en localStorage, como venía funcionando.
   ================================================================== */

const HAY_SERVIDOR = location.protocol === 'http:' || location.protocol === 'https:';
const COLA_KEY = STORAGE_KEY + '-pendientes';

/* Arranca con la caché para pintar sin esperar a la red. */
let datos = cargarCache();

let usuario = null;             // { nombre, rol } cuando hay sesión
let conectado = false;
let alRefrescar = () => {};     // la vista registra acá su render
let alCambiarConexion = () => {};

/* La vista llama a esto en el arranque. */
function iniciarSync(refrescar, cambioConexion = () => {}) {
  alRefrescar = refrescar;
  alCambiarConexion = cambioConexion;
  if (!HAY_SERVIDOR) { marcarConexion(false); return; }
  sincronizar();
  escucharEventos();
  window.addEventListener('online', () => { vaciarCola(); sincronizar(); });
}

function marcarConexion(ok) {
  if (conectado === ok) return;
  conectado = ok;
  alCambiarConexion(ok, usuario);
}

/* ---------- Caché local ---------- */

function cargarCache() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      if (Array.isArray(d.vehiculos)) return migrar(d);
    }
  } catch (e) {
    console.warn('No se pudo leer el almacenamiento local:', e);
  }
  return { vehiculos: [] };
}

function guardarCache() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(datos));
  } catch (e) {
    console.warn('No se pudo escribir la caché local:', e);
  }
}

/* ---------- Traer del servidor ---------- */

async function sincronizar() {
  if (!HAY_SERVIDOR) return;
  try {
    const r = await fetch('/api/datos', { credentials: 'same-origin' });
    if (r.status === 401) return irALogin();
    if (!r.ok) throw new Error(r.statusText);

    datos = migrar(await r.json());
    guardarCache();
    marcarConexion(true);
    alRefrescar();

    if (!usuario) {
      const ry = await fetch('/api/yo', { credentials: 'same-origin' });
      if (ry.ok) { usuario = await ry.json(); alCambiarConexion(true, usuario); }
    }
    vaciarCola();
  } catch (e) {
    console.warn('Sin conexión con el servidor, se trabaja con la copia local:', e.message);
    marcarConexion(false);
  }
}

function irALogin() {
  location.href = 'login.html?volver=' + encodeURIComponent(location.pathname);
}

/* Cuando otro dispositivo guarda algo, el servidor avisa y refrescamos. */
function escucharEventos() {
  const es = new EventSource('/api/eventos');
  es.onmessage = () => sincronizar();
  es.onopen = () => marcarConexion(true);
  es.onerror = () => marcarConexion(false);   // EventSource reintenta solo
}

/* ---------- Guardar ---------- */

/* Guarda UN vehículo. Es la unidad de cambio: así dos personas editando
   vehículos distintos nunca se pisan. */
async function guardarVehiculo(v) {
  guardarCache();
  if (!HAY_SERVIDOR) return;
  await enviar('PUT', `/api/vehiculos/${v.id}`, v);
}

async function borrarVehiculoRemoto(id) {
  datos.vehiculos = datos.vehiculos.filter(v => v.id !== id);
  guardarCache();
  if (!HAY_SERVIDOR) return;
  await enviar('DELETE', `/api/vehiculos/${id}`);
}

/* Reemplazo total (importar backup / borrar todo). */
async function reemplazarTodo(nuevos) {
  datos = migrar({ vehiculos: nuevos });
  guardarCache();
  if (!HAY_SERVIDOR) return;
  await enviar('PUT', '/api/datos', { vehiculos: datos.vehiculos });
}

/* Compatibilidad: guardar() sin argumentos solo persiste la caché. */
function guardar() { guardarCache(); }

/* ---------- Envío con reintento ---------- */

async function enviar(metodo, url, cuerpo) {
  try {
    const r = await fetch(url, {
      method: metodo,
      credentials: 'same-origin',
      headers: cuerpo ? { 'Content-Type': 'application/json' } : undefined,
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
    if (r.status === 401) return irALogin();
    if (r.status === 403) {
      alert('Tu usuario no tiene permiso para esta acción.');
      return sincronizar();
    }
    if (!r.ok) throw new Error(r.statusText);
    marcarConexion(true);
  } catch (e) {
    // Sin señal: queda pendiente y se reintenta al volver la conexión.
    encolar({ metodo, url, cuerpo });
    marcarConexion(false);
  }
}

function encolar(op) {
  const cola = leerCola().filter(o => !(o.url === op.url && o.metodo === op.metodo));
  cola.push(op);
  localStorage.setItem(COLA_KEY, JSON.stringify(cola));
}

function leerCola() {
  try { return JSON.parse(localStorage.getItem(COLA_KEY)) || []; }
  catch { return []; }
}

let vaciando = false;

async function vaciarCola() {
  if (vaciando || !HAY_SERVIDOR) return;
  const cola = leerCola();
  if (!cola.length) return;
  vaciando = true;
  localStorage.removeItem(COLA_KEY);
  for (const op of cola) await enviar(op.metodo, op.url, op.cuerpo);
  vaciando = false;
}

/* Cantidad de cambios que todavía no llegaron al servidor. */
const cambiosPendientes = () => leerCola().length;

/* Adapta datos de versiones anteriores para que nada quede huérfano. */
function migrar(d) {
  const valido = id => ESTADOS.some(e => e.id === id);
  const traducir = id => {
    const n = ESTADOS_VIEJOS[id] || id;
    return valido(n) ? n : '';
  };

  for (const v of d.vehiculos) {
    v.estado = traducir(v.estado) || ESTADO_DEFECTO;

    // Antes los problemas eran un texto libre: cada renglón pasa a ser un problema.
    if (typeof v.problemas === 'string') {
      v.problemas = v.problemas.split('\n').map(t => t.trim()).filter(Boolean)
        .map(texto => ({ texto, categoria: detectarCategoria(texto), manual: false }));
    }
    v.problemas ||= [];
    for (const p of v.problemas) {
      p.categoria = CATEGORIAS_VIEJAS[p.categoria] || p.categoria;
      if (!CATEGORIAS.some(c => c.id === p.categoria)) p.categoria = detectarCategoria(p.texto);
    }

    v.pedidos ||= [];

    v.updates ||= {};
    for (const f of Object.keys(v.updates)) {
      let lista = v.updates[f];
      if (!Array.isArray(lista)) lista = [lista];
      lista = lista.filter(u => u && (u.texto || u.operario || u.sector));
      for (const u of lista) { delete u.estado; delete u.horas; }
      if (lista.length) v.updates[f] = lista;
      else delete v.updates[f];
    }
  }
  return d;
}

const nuevoId = () => 'v' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/* ---------- Consultas ---------- */

const vehiculoPorId = id => datos.vehiculos.find(v => v.id === id);

/* Fechas con actualizaciones, de la más reciente a la más vieja. */
const fechasConUpdates = v => Object.keys(v.updates || {}).sort().reverse();

const ultimaFechaUpdate = v => fechasConUpdates(v)[0] || null;

/* Texto sobre el que buscar un vehículo. */
function textoBuscable(v) {
  return [
    v.patente,
    ...(v.problemas || []).map(p => `${p.texto} ${categoriaPorId(p.categoria).label}`),
    ...(v.pedidos || []).map(p => p.descripcion),
    ...Object.values(v.updates || {}).flat().map(u => `${u.sector} ${u.texto}`),
  ].join(' ');
}

/* ---------- Patentes ---------- */

/* Se guardan sin separadores; el formato es cosa de la pantalla. */
const normalizarPatente = p => String(p || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/* El formato sale de la CANTIDAD de caracteres, no del patrón exacto:
   6 → chapa anterior (ABC 123) · 7 → Mercosur (AB 123 CD).
   Cualquier otro largo se muestra sin agrupar y sin banda de país. */
function tipoPatente(p) {
  const n = normalizarPatente(p).length;
  if (n === 7) return 'mercosur';
  if (n === 6) return 'vieja';
  return 'otra';
}

function formatearPatente(p) {
  const s = normalizarPatente(p);
  switch (tipoPatente(s)) {
    case 'vieja':    return `${s.slice(0, 3)} ${s.slice(3)}`;
    case 'mercosur': return `${s.slice(0, 2)} ${s.slice(2, 5)} ${s.slice(5)}`;
    default:         return s;
  }
}

/* Chapa dibujada. El tamaño lo define el font-size del contenedor. */
function patenteHTML(p) {
  const tipo = tipoPatente(p);
  const banda = tipo === 'mercosur' ? 'REPÚBLICA ARGENTINA'
              : tipo === 'vieja' ? 'ARGENTINA'
              : '';
  return `<span class="patente pat-${tipo}">` +
    (banda ? `<span class="pat-banda">${banda}</span>` : '') +
    `<span class="pat-num">${escapar(formatearPatente(p))}</span></span>`;
}

function escapar(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
