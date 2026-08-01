/* ============================================================
   Parte de Trabajo — vista de escritorio (grilla vehículo × día)
   Requiere core.js cargado antes que este archivo.
   ============================================================ */

/* El rango va desde el día más viejo con datos (o 14 días atrás) hasta 3 semanas
   adelante. La grilla se dibuja entera y el scroll arranca posicionado en HOY:
   para ver días anteriores se desplaza a la izquierda, y al llegar al borde se
   cargan más días viejos automáticamente. */
const DIAS_PASADO_MIN = 14;
const DIAS_FUTURO = 21;
const BLOQUE_CARGA = 21;

const vista = {
  desde: null,
  hasta: null,
  buscar: '',
  estadosVisibles: new Set(ESTADOS.map(e => e.id)),
  ocultarTerminados: false,
};

let vehiculoEditando = null;   // id o null (=nuevo)
let celdaEditando = null;      // { vehiculoId, fecha, idx }

const $ = sel => document.querySelector(sel);

/* ---------- Render ---------- */

/* Extiende el rango hacia atrás si hay ingresos o actualizaciones más viejas,
   así ningún dato cargado queda fuera de la grilla. */
function ajustarRango() {
  const hoy = hoyISO();
  let min = vista.desde || sumarDias(hoy, -DIAS_PASADO_MIN);
  for (const v of datos.vehiculos) {
    if (v.ingreso && v.ingreso < min) min = v.ingreso;
    for (const f of Object.keys(v.updates || {})) if (f < min) min = f;
  }
  vista.desde = min;
  const finMin = sumarDias(hoy, DIAS_FUTURO);
  if (!vista.hasta || vista.hasta < finMin) vista.hasta = finMin;
}

function diasVisibles() {
  const n = diffDias(vista.desde, vista.hasta) + 1;
  return Array.from({ length: n }, (_, i) => sumarDias(vista.desde, i));
}

function vehiculosFiltrados() {
  const q = vista.buscar.trim();
  return datos.vehiculos.filter(v => {
    if (!vista.estadosVisibles.has(v.estado)) return false;
    if (vista.ocultarTerminados && v.estado === 'operativo') return false;
    if (!q) return true;
    return normalizar(textoBuscable(v)).includes(normalizar(q));
  });
}

function render() {
  ajustarRango();
  const scrollPrevio = wrap.scrollLeft;
  const dias = diasVisibles();
  const hoy = hoyISO();
  const lista = vehiculosFiltrados();

  // --- Encabezado ---
  const thead = $('#thead');
  thead.innerHTML = '';
  const trh = document.createElement('tr');

  const thFija = document.createElement('th');
  thFija.className = 'col-fija';
  thFija.innerHTML = '<span class="th-titulo">Vehículo</span>';
  trh.appendChild(thFija);

  for (const f of dias) {
    const th = document.createElement('th');
    th.className = 'dia';
    if (f === hoy) th.classList.add('hoy');
    else if (esFinde(f)) th.classList.add('finde');
    th.innerHTML = `<span class="dia-num">${fechaCorta(f)}</span>
                    <span class="dia-nom">${f === hoy ? 'hoy' : NOMBRE_DIA[isoADate(f).getDay()]}</span>`;
    trh.appendChild(th);
  }
  thead.appendChild(trh);

  // --- Filas ---
  const tbody = $('#tbody');
  tbody.innerHTML = '';

  for (const v of lista) {
    const tr = document.createElement('tr');
    tr.dataset.id = v.id;

    const est = estadoPorId(v.estado);
    const td = document.createElement('td');
    td.className = 'col-fija';
    const diasEnTaller = v.ingreso ? diffDias(v.ingreso, hoy) : null;
    const abiertos = pedidosAbiertos(v).length;
    td.innerHTML = `
      <div class="veh" data-editar-vehiculo="${v.id}">
        <span class="veh-patente">
          <span class="estado-dot" style="background:${est.color}" title="${est.label}"></span>
          ${escapar(v.patente)}
          ${abiertos ? `<span class="veh-pedidos" title="${abiertos} pedido(s) de repuestos sin cerrar">⛭ ${abiertos}</span>` : ''}
        </span>
        ${(v.problemas || []).map(p => {
          const c = categoriaPorId(p.categoria);
          return `<span class="prob" style="--cat:${c.color}" title="${escapar(c.label)}: ${escapar(p.texto)}">
                    <span class="prob-etiqueta">${escapar(c.label)}</span>
                    <span class="prob-txt">${escapar(p.texto)}</span>
                  </span>`;
        }).join('')}
        ${diasEnTaller !== null ? `<span class="veh-dias">${diasEnTaller} día${diasEnTaller === 1 ? '' : 's'} en taller</span>` : ''}
      </div>`;
    tr.appendChild(td);

    for (const f of dias) {
      const celda = document.createElement('td');
      celda.className = 'celda';
      if (f === hoy) celda.classList.add('hoy');
      else if (esFinde(f)) celda.classList.add('finde');
      celda.dataset.vehiculo = v.id;
      celda.dataset.fecha = f;

      const updates = v.updates?.[f] || [];
      const bloques = updates.map((u, i) => `
          <div class="upd" data-idx="${i}" style="border-left-color:${colorSector(u.sector)}">
            ${u.sector ? `<span class="upd-sector">${escapar(u.sector)}</span>` : ''}
            <span class="upd-texto">${escapar(u.texto || '')}</span>
            ${u.operario ? `<span class="upd-pie">${escapar(u.operario)}</span>` : ''}
          </div>`).join('');

      celda.innerHTML = `<div class="celda-inner">${bloques}
        <button type="button" class="btn-add-upd" data-nueva title="Agregar actualización">+</button>
      </div>`;
      if (!updates.length) celda.classList.add('vacia');
      tr.appendChild(celda);
    }
    tbody.appendChild(tr);
  }

  // --- Auxiliares ---
  $('#contador').textContent = `${lista.length} de ${datos.vehiculos.length} vehículo${datos.vehiculos.length === 1 ? '' : 's'}`;
  $('#vacio').classList.toggle('hidden', datos.vehiculos.length > 0);
  if (wrap.scrollLeft !== scrollPrevio) wrap.scrollLeft = scrollPrevio;
}

/* ---------- Chips de estado ---------- */

function renderChips() {
  const cont = $('#filtroEstados');
  cont.innerHTML = '';
  for (const e of ESTADOS) {
    const b = document.createElement('button');
    b.className = 'chip' + (vista.estadosVisibles.has(e.id) ? ' on' : '');
    b.style.color = vista.estadosVisibles.has(e.id) ? e.color : '';
    b.innerHTML = `<span class="dot" style="background:${e.color}"></span>${e.label}`;
    b.onclick = () => {
      if (vista.estadosVisibles.has(e.id)) vista.estadosVisibles.delete(e.id);
      else vista.estadosVisibles.add(e.id);
      renderChips();
      render();
    };
    cont.appendChild(b);
  }
}

function llenarSelectEstados(sel) {
  sel.innerHTML = ESTADOS.map(e => `<option value="${e.id}">${e.label}</option>`).join('');
}

/* ---------- Filas de problemas (modal de vehículo) ---------- */

/* Crea una fila: texto + categoría detectada + botón de quitar.
   Mientras el usuario no elija categoría a mano, se redetecta al tipear. */
function filaProblema(p = {}) {
  const fila = document.createElement('div');
  fila.className = 'prob-fila';
  fila.innerHTML = `
    <input class="prob-texto" placeholder="Ej: pierde aceite por tapa de válvulas" autocomplete="off">
    <select class="prob-cat">${CATEGORIAS.map(c => `<option value="${c.id}">${c.label}</option>`).join('')}</select>
    <button type="button" class="fila-quitar" title="Quitar">×</button>`;

  const inp = fila.querySelector('.prob-texto');
  const sel = fila.querySelector('.prob-cat');

  inp.value = p.texto || '';
  sel.value = p.categoria || detectarCategoria(p.texto) || CATEGORIA_DEFECTO;
  fila.dataset.manual = p.manual ? '1' : '';
  pintarCategoria(sel);

  inp.addEventListener('input', () => {
    if (fila.dataset.manual) return;
    sel.value = detectarCategoria(inp.value) || CATEGORIA_DEFECTO;
    pintarCategoria(sel);
  });

  inp.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    agregarFilaProblema().querySelector('.prob-texto').focus();
  });

  sel.addEventListener('change', () => { fila.dataset.manual = '1'; pintarCategoria(sel); });

  fila.querySelector('.fila-quitar').addEventListener('click', () => {
    fila.remove();
    if (!$('#listaProblemas').children.length) agregarFilaProblema();
  });

  return fila;
}

function pintarCategoria(sel) {
  sel.style.borderLeft = `4px solid ${categoriaPorId(sel.value).color}`;
}

function agregarFilaProblema(p) {
  const fila = filaProblema(p);
  $('#listaProblemas').appendChild(fila);
  return fila;
}

function leerProblemas() {
  return [...$('#listaProblemas').children]
    .map(f => ({
      texto: f.querySelector('.prob-texto').value.trim(),
      categoria: f.querySelector('.prob-cat').value,
      manual: !!f.dataset.manual,
    }))
    .filter(p => p.texto);
}

$('#btnAddProblema').addEventListener('click', () => {
  agregarFilaProblema().querySelector('.prob-texto').focus();
});

/* ---------- Filas de pedidos de repuestos (modal de vehículo) ---------- */

function filaPedido(p = {}) {
  const fila = document.createElement('div');
  fila.className = 'ped-fila';
  fila.innerHTML = `
    <input class="ped-desc" placeholder="Repuesto solicitado" autocomplete="off">
    <input class="ped-cant" type="number" min="1" step="1" title="Cantidad">
    <select class="ped-estado">${ESTADOS_PEDIDO.map(e => `<option value="${e.id}">${e.label}</option>`).join('')}</select>
    <button type="button" class="fila-quitar" title="Quitar">×</button>`;

  const sel = fila.querySelector('.ped-estado');
  fila.querySelector('.ped-desc').value = p.descripcion || '';
  fila.querySelector('.ped-cant').value = p.cantidad || 1;
  sel.value = p.estado || PEDIDO_DEFECTO;
  fila.dataset.fecha = p.fecha || hoyISO();
  fila.dataset.solicitante = p.solicitante || '';

  const pintar = () => sel.style.borderLeft = `4px solid ${pedidoEstadoPorId(sel.value).color}`;
  pintar();
  sel.addEventListener('change', pintar);

  fila.querySelector('.fila-quitar').addEventListener('click', () => fila.remove());
  return fila;
}

function agregarFilaPedido(p) {
  const fila = filaPedido(p);
  $('#listaPedidos').appendChild(fila);
  return fila;
}

function leerPedidos() {
  return [...$('#listaPedidos').children]
    .map(f => ({
      descripcion: f.querySelector('.ped-desc').value.trim(),
      cantidad: Number(f.querySelector('.ped-cant').value) || 1,
      estado: f.querySelector('.ped-estado').value,
      fecha: f.dataset.fecha,
      solicitante: f.dataset.solicitante,
    }))
    .filter(p => p.descripcion);
}

$('#btnAddPedido').addEventListener('click', () => {
  agregarFilaPedido().querySelector('.ped-desc').focus();
});

/* ---------- Vehículos ---------- */

function abrirVehiculo(id = null) {
  vehiculoEditando = id;
  const v = id ? vehiculoPorId(id) : null;
  $('#dlgVehiculoTitulo').textContent = v ? 'Editar vehículo' : 'Nuevo vehículo';
  $('#vPatente').value = v?.patente || '';
  $('#vIngreso').value = v?.ingreso || hoyISO();
  $('#vEstado').value = v?.estado || ESTADO_DEFECTO;

  $('#listaProblemas').innerHTML = '';
  (v?.problemas?.length ? v.problemas : [{}]).forEach(p => agregarFilaProblema(p));

  $('#listaPedidos').innerHTML = '';
  (v?.pedidos || []).forEach(p => agregarFilaPedido(p));

  $('#btnBorrarVehiculo').classList.toggle('hidden', !v);
  $('#dlgVehiculo').showModal();
  $('#vPatente').focus();
}

$('#formVehiculo').addEventListener('submit', () => {
  const patente = $('#vPatente').value.trim().toUpperCase();
  if (!patente) return;
  const campos = {
    patente,
    ingreso: $('#vIngreso').value,
    problemas: leerProblemas(),
    pedidos: leerPedidos(),
    estado: $('#vEstado').value,
  };
  let v;
  if (vehiculoEditando) {
    v = Object.assign(vehiculoPorId(vehiculoEditando), campos);
  } else {
    v = { id: nuevoId(), ...campos, updates: {}, pedidos: campos.pedidos || [] };
    datos.vehiculos.push(v);
  }
  guardarVehiculo(v);
  render();
});

$('#btnBorrarVehiculo').addEventListener('click', () => {
  const v = vehiculoPorId(vehiculoEditando);
  if (!v) return;
  if (!confirm(`¿Eliminar ${v.patente} y todas sus actualizaciones?`)) return;
  borrarVehiculoRemoto(vehiculoEditando);
  render();
  $('#dlgVehiculo').close();
});

/* ---------- Actualizaciones ---------- */

/* idx = null → nueva actualización; idx = número → editar la existente. */
function abrirUpdate(vehiculoId, fecha, idx = null) {
  const v = vehiculoPorId(vehiculoId);
  if (!v) return;
  celdaEditando = { vehiculoId, fecha, idx };
  const u = idx === null ? {} : (v.updates?.[fecha]?.[idx] || {});
  const cantidad = (v.updates?.[fecha] || []).length;

  $('#updTitulo').textContent = idx === null ? 'Nueva actualización' : 'Editar actualización';
  $('#updMeta').textContent = `${v.patente} — ${fechaLarga(fecha)}` +
    (idx === null && cantidad ? ` · ya hay ${cantidad} en este día` : '');
  $('#uSector').value = u.sector || '';
  $('#uTexto').value = u.texto || '';
  $('#uOperario').value = u.operario || '';
  $('#btnBorrarUpdate').classList.toggle('hidden', idx === null);
  $('#dlgUpdate').showModal();
  ($('#uSector').value ? $('#uTexto') : $('#uSector')).focus();
}

$('#formUpdate').addEventListener('submit', () => {
  if (!celdaEditando) return;
  const { vehiculoId, fecha, idx } = celdaEditando;
  const v = vehiculoPorId(vehiculoId);
  if (!v) return;

  const u = {
    sector: $('#uSector').value.trim(),
    texto: $('#uTexto').value.trim(),
    operario: $('#uOperario').value.trim(),
  };

  v.updates ||= {};
  const lista = v.updates[fecha] || [];

  if (!u.texto && !u.operario && !u.sector) {
    if (idx !== null) lista.splice(idx, 1);   // se vació: se elimina
  } else if (idx === null) {
    lista.push(u);
  } else {
    lista[idx] = u;
  }

  if (lista.length) v.updates[fecha] = lista;
  else delete v.updates[fecha];

  guardarVehiculo(v);
  render();
});

$('#btnBorrarUpdate').addEventListener('click', () => {
  const { vehiculoId, fecha, idx } = celdaEditando || {};
  if (idx === null || idx === undefined) return;
  const v = vehiculoPorId(vehiculoId);
  const lista = v?.updates?.[fecha];
  if (!lista) return;
  if (!confirm('¿Eliminar esta actualización?')) return;
  lista.splice(idx, 1);
  if (!lista.length) delete v.updates[fecha];
  guardarVehiculo(v);
  render();
  $('#dlgUpdate').close();
});

/* ---------- Interacción tabla ---------- */

$('#tbody').addEventListener('click', ev => {
  const veh = ev.target.closest('[data-editar-vehiculo]');
  if (veh) { abrirVehiculo(veh.dataset.editarVehiculo); return; }

  const celda = ev.target.closest('td.celda');
  if (!celda) return;

  const bloque = ev.target.closest('.upd');
  const nueva = ev.target.closest('[data-nueva]');
  const idx = bloque && !nueva ? Number(bloque.dataset.idx) : null;
  abrirUpdate(celda.dataset.vehiculo, celda.dataset.fecha, idx);
});

/* ---------- Navegación de días (por scroll) ---------- */

const wrap = $('.tabla-wrap');

/* Deja la columna de HOY pegada al borde derecho de la columna fija. */
function irAHoy(suave = true) {
  const th = $('thead th.dia.hoy');
  const fija = $('thead th.col-fija');
  if (!th || !fija) return;
  const delta = th.getBoundingClientRect().left - fija.getBoundingClientRect().right;
  wrap.scrollTo({ left: wrap.scrollLeft + delta, behavior: suave ? 'smooth' : 'auto' });
}

$('#btnHoy').onclick = () => irAHoy();

/* Al acercarse a cualquiera de los dos bordes, se agregan más días sin perder
   la posición visual del scroll. */
let ampliando = false;

wrap.addEventListener('scroll', () => {
  if (ampliando) return;
  const margen = 400;

  if (wrap.scrollLeft < margen) {
    ampliando = true;
    const anchoAntes = wrap.scrollWidth;
    vista.desde = sumarDias(vista.desde, -BLOQUE_CARGA);
    render();
    wrap.scrollLeft += wrap.scrollWidth - anchoAntes;
    ampliando = false;
  } else if (wrap.scrollLeft + wrap.clientWidth > wrap.scrollWidth - margen) {
    ampliando = true;
    vista.hasta = sumarDias(vista.hasta, BLOQUE_CARGA);
    render();
    ampliando = false;
  }
});

/* ---------- Filtros ---------- */

$('#buscar').addEventListener('input', e => { vista.buscar = e.target.value; render(); });
$('#ocultarTerminados').addEventListener('change', e => { vista.ocultarTerminados = e.target.checked; render(); });

/* ---------- Menú / datos ---------- */

$('#btnMenu').onclick = e => { e.stopPropagation(); $('#menuPanel').classList.toggle('hidden'); };
document.addEventListener('click', () => $('#menuPanel').classList.add('hidden'));

$('#menuPanel').addEventListener('click', e => {
  const acc = e.target.dataset.action;
  if (!acc) return;
  if (acc === 'export') exportar();
  if (acc === 'import') $('#fileImport').click();
  if (acc === 'print') window.print();
  if (acc === 'reset') {
    if (confirm('Esto borra TODOS los vehículos y actualizaciones. ¿Continuar?')) {
      reemplazarTodo([]);
      render();
    }
  }
});

function exportar() {
  const blob = new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `parte-trabajo-${hoyISO()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

$('#fileImport').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const d = JSON.parse(await file.text());
    if (!Array.isArray(d.vehiculos)) throw new Error('El archivo no tiene la estructura esperada.');
    if (!confirm('Esto reemplaza los datos actuales. ¿Continuar?')) return;
    await reemplazarTodo(d.vehiculos);
    render();
  } catch (err) {
    alert('No se pudo importar: ' + err.message);
  }
  e.target.value = '';
});

/* ---------- Varios ---------- */

document.querySelectorAll('[data-cerrar]').forEach(b => b.onclick = () => b.closest('dialog').close());
$('#btnAddVehiculo').onclick = () => abrirVehiculo();
document.querySelector('[data-add-vehiculo]').onclick = () => abrirVehiculo();

document.addEventListener('keydown', e => {
  if (document.querySelector('dialog[open]')) return;
  if (e.target.matches('input, textarea, select')) return;
  if (e.key === 'ArrowLeft') wrap.scrollBy({ left: -wrap.clientWidth * 0.6, behavior: 'smooth' });
  if (e.key === 'ArrowRight') wrap.scrollBy({ left: wrap.clientWidth * 0.6, behavior: 'smooth' });
  if (e.key === 'Home') irAHoy();
  if (e.key.toLowerCase() === 'n') { e.preventDefault(); abrirVehiculo(); }
});

/* ---------- Estado de la conexión ---------- */

function mostrarConexion(ok, usuario) {
  const el = $('#conexion');
  const pend = cambiosPendientes();
  if (!HAY_SERVIDOR) {
    el.className = 'conexion local';
    el.textContent = 'Solo este equipo';
    el.title = 'Abierta como archivo: los datos no se comparten con otros dispositivos.';
    return;
  }
  el.className = 'conexion ' + (ok ? 'ok' : 'off');
  el.textContent = ok
    ? (usuario ? `${usuario.nombre} · en línea` : 'En línea')
    : `Sin conexión${pend ? ` · ${pend} sin enviar` : ''}`;
  el.title = ok ? 'Sincronizado con el servidor' : 'Los cambios se guardan y se envían al recuperar señal.';
}

/* ---------- Arranque ---------- */

llenarSelectEstados($('#vEstado'));
$('#listaSectores').innerHTML = SECTORES.map(s => `<option value="${s}">`).join('');
renderChips();
render();
irAHoy(false);
iniciarSync(() => { renderChips(); render(); }, mostrarConexion);
mostrarConexion(false);
