/* ============================================================
   Parte de Trabajo — vista móvil (para el mecánico)
   Lista compacta de patentes → detalle → actualizaciones y pedidos.
   Requiere core.js cargado antes que este archivo.
   ============================================================ */

const $ = sel => document.querySelector(sel);

const vista = { buscar: '' };

let vehiculoAbierto = null;   // id del vehículo en pantalla de detalle
let updEditando = null;       // { fecha, idx } | null si es nueva
let pedidoEditando = null;    // índice | null si es nuevo

/* ---------- Lista ---------- */

function vehiculosFiltrados() {
  const q = vista.buscar.trim();
  if (!q) return datos.vehiculos;
  return datos.vehiculos.filter(v => normalizar(textoBuscable(v)).includes(normalizar(q)));
}

function renderLista() {
  const lista = vehiculosFiltrados();
  const ul = $('#mLista');
  ul.innerHTML = '';

  for (const v of lista) {
    const e = estadiaActual(v);
    if (!e) continue;
    const est = estadoPorId(e.estado);
    const abiertos = pedidosAbiertos(e).length;
    const ultima = ultimaFechaUpdate(e);
    const nProb = (e.problemas || []).length;

    const meta = estaFinalizado(e)
      ? `finalizado el ${fechaCorta(e.finalizado)}`
      : [
          nProb ? `${nProb} problema${nProb === 1 ? '' : 's'}` : '',
          ultima ? `novedad ${fechaRelativa(ultima)}` : 'sin novedades',
        ].filter(Boolean).join(' · ');

    const li = document.createElement('li');
    li.className = 'm-item';
    li.style.setProperty('--est', est.color);
    li.dataset.id = v.id;
    li.innerHTML = `
      <div class="m-item-main">
        <div class="m-item-pat">${patenteHTML(v.patente)}</div>
        <div class="m-item-est">${escapar(est.label)}</div>
        <div class="m-item-meta">${escapar(meta)}</div>
      </div>
      ${abiertos ? `<div class="m-item-badges"><span class="m-badge">${abiertos} pedido${abiertos === 1 ? '' : 's'}</span></div>` : ''}
      <span class="m-flecha">›</span>`;
    li.onclick = () => abrirDetalle(v.id);
    ul.appendChild(li);
  }

  $('#mVacio').classList.toggle('hidden', lista.length > 0);
  $('#mContador').textContent =
    `${lista.length} de ${datos.vehiculos.length} unidad${datos.vehiculos.length === 1 ? '' : 'es'}`;
}

$('#mBuscar').addEventListener('input', e => { vista.buscar = e.target.value; renderLista(); });

/* ---------- Detalle ---------- */

function abrirDetalle(id) {
  vehiculoAbierto = id;
  renderDetalle();
  $('#pantallaLista').classList.add('oculta');
  $('#pantallaDetalle').classList.remove('oculta');
  history.pushState({ detalle: id }, '');
}

function volverALista() {
  vehiculoAbierto = null;
  $('#pantallaDetalle').classList.add('oculta');
  $('#pantallaLista').classList.remove('oculta');
  renderLista();
}

$('#btnVolver').onclick = () => history.back();

/* El botón físico "atrás" del celular cierra el detalle en vez de salir. */
window.addEventListener('popstate', () => {
  if (vehiculoAbierto) volverALista();
});

function renderDetalle() {
  const v = vehiculoPorId(vehiculoAbierto);
  if (!v) return volverALista();

  const e = estadiaActual(v);
  if (!e) return volverALista();
  const dias = diasEnTaller(e);
  const { visitas } = resumenHistorico(v);
  $('#dPatente').innerHTML = patenteHTML(v.patente);
  $('#dSub').textContent = [
    dias === null ? '' : `${dias} día${dias === 1 ? '' : 's'} en taller`,
    estaFinalizado(e) ? `finalizado el ${fechaCorta(e.finalizado)}` : '',
    visitas > 1 ? `visita ${visitas}` : '',
  ].filter(Boolean).join(' · ');

  // --- Estado (tocar para cambiar) ---
  const cont = $('#dEstados');
  cont.innerHTML = '';
  for (const o of ESTADOS) {
    const b = document.createElement('button');
    b.className = 'm-est-btn' + (e.estado === o.id ? ' on' : '');
    b.style.color = e.estado === o.id ? o.color : '';
    b.innerHTML = `<span class="dot" style="background:${o.color}"></span>${o.label}`;
    b.onclick = () => { cambiarEstado(e, o.id); guardarVehiculo(v); renderDetalle(); };
    cont.appendChild(b);
  }

  // --- Problemas ---
  const probs = e.problemas || [];
  $('#dProblemas').innerHTML = probs.length
    ? probs.map(p => {
        const c = categoriaPorId(p.categoria);
        return `<div class="m-prob" style="--cat:${c.color}">
                  <span class="m-prob-cat">${escapar(c.label)}</span>
                  <span class="m-prob-txt">${escapar(p.texto)}</span>
                </div>`;
      }).join('')
    : '<p class="m-nada">Sin problemas cargados.</p>';

  // --- Pedidos ---
  const peds = e.pedidos || [];
  $('#dPedidos').innerHTML = peds.length
    ? peds.map((p, i) => {
        const ep = pedidoEstadoPorId(p.estado);
        return `<div class="m-pedido" style="--ped:${ep.color}" data-ped="${i}">
                  <div class="m-ped-top">
                    <span class="m-ped-cant">×${p.cantidad || 1}</span>
                    <span class="m-ped-desc">${escapar(p.descripcion)}</span>
                  </div>
                  <div class="m-ped-pie">
                    <span class="m-ped-estado">${escapar(ep.label)}</span>
                    ${p.urgente ? '<span class="m-urgente">URGENTE</span>' : ''}
                    <span>${escapar(p.solicitante || '')}${p.solicitante && p.fecha ? ' · ' : ''}${p.fecha ? fechaRelativa(p.fecha) : ''}</span>
                  </div>
                </div>`;
      }).join('')
    : '<p class="m-nada">Sin pedidos de repuestos.</p>';

  // --- Actualizaciones, de la más reciente a la más vieja ---
  const fechas = fechasConUpdates(e);
  $('#dUpdates').innerHTML = fechas.length
    ? fechas.map(f => `
        <div class="m-dia">
          <div class="m-dia-fecha"><b>${fechaLarga(f)}</b> · ${fechaRelativa(f)}</div>
          ${e.updates[f].map((u, i) => `
            <div class="m-upd" style="--sec:${colorSector(u.sector)}" data-fecha="${f}" data-idx="${i}">
              ${u.sector ? `<div class="m-upd-sector">${escapar(u.sector)}</div>` : ''}
              <div class="m-upd-txt">${escapar(u.texto || '')}</div>
              ${u.operario ? `<div class="m-upd-pie">${escapar(u.operario)}</div>` : ''}
            </div>`).join('')}
        </div>`).join('')
    : '<p class="m-nada">Todavía no hay actualizaciones.</p>';
}

/* Delegación: tocar una actualización o un pedido lo abre para editar. */
$('#dUpdates').addEventListener('click', ev => {
  const el = ev.target.closest('.m-upd');
  if (el) abrirHojaUpd(el.dataset.fecha, Number(el.dataset.idx));
});

$('#dPedidos').addEventListener('click', ev => {
  const el = ev.target.closest('[data-ped]');
  if (el) abrirHojaPedido(Number(el.dataset.ped));
});

/* ---------- Hojas ---------- */

function abrirHoja(sel) { $(sel).classList.remove('oculta'); }
function cerrarHojas() {
  $('#hojaUpd').classList.add('oculta');
  $('#hojaPedido').classList.add('oculta');
}
document.querySelectorAll('[data-cerrar-hoja]').forEach(el => el.onclick = cerrarHojas);

/* ---------- Actualizaciones ---------- */

function abrirHojaUpd(fecha = null, idx = null) {
  const v = vehiculoPorId(vehiculoAbierto);
  const e = v && estadiaActual(v);
  if (!e) return;
  const f = fecha || hoyISO();
  const u = idx === null ? {} : (e.updates?.[f]?.[idx] || {});
  updEditando = { fecha: f, idx };

  $('#hUpdTitulo').textContent = idx === null ? 'Nueva actualización' : 'Editar actualización';
  $('#hUpdMeta').textContent = formatearPatente(v.patente);
  $('#hSector').value = u.sector || localStorage.getItem('ultimoSector') || '';
  $('#hTexto').value = u.texto || '';
  $('#hOperario').value = u.operario || localStorage.getItem('ultimoOperario') || '';
  $('#hFecha').value = f;
  $('#btnBorrarUpd').classList.toggle('hidden', idx === null);
  abrirHoja('#hojaUpd');
  $('#hTexto').focus();
}

$('#btnNuevaUpd').onclick = () => abrirHojaUpd();

$('#formUpd').addEventListener('submit', ev => {
  ev.preventDefault();
  const v = vehiculoPorId(vehiculoAbierto);
  const e = v && estadiaActual(v);
  if (!e || !updEditando) return;

  const u = {
    sector: enMinuscula($('#hSector').value),
    texto: enMinuscula($('#hTexto').value),
    operario: enMinuscula($('#hOperario').value),
  };
  const fechaNueva = $('#hFecha').value || hoyISO();
  const { fecha, idx } = updEditando;

  if (!u.texto && !u.sector && !u.operario) { cerrarHojas(); return; }

  e.updates ||= {};
  // Si se cambió la fecha, la actualización se muda de día.
  if (idx !== null) {
    e.updates[fecha].splice(idx, 1);
    if (!e.updates[fecha].length) delete e.updates[fecha];
  }
  (e.updates[fechaNueva] ||= []).push(u);

  // Se recuerdan para no reescribirlos en cada carga.
  if (u.sector) localStorage.setItem('ultimoSector', u.sector);
  if (u.operario) localStorage.setItem('ultimoOperario', u.operario);

  guardarVehiculo(v);
  cerrarHojas();
  renderDetalle();
});

$('#btnBorrarUpd').onclick = () => {
  const v = vehiculoPorId(vehiculoAbierto);
  const e = v && estadiaActual(v);
  const { fecha, idx } = updEditando || {};
  if (!e || idx === null || idx === undefined) return;
  if (!confirm('¿Eliminar esta actualización?')) return;
  e.updates[fecha].splice(idx, 1);
  if (!e.updates[fecha].length) delete e.updates[fecha];
  guardarVehiculo(v);
  cerrarHojas();
  renderDetalle();
};

/* ---------- Pedidos de repuestos ---------- */

/* Artículos que se van sumando antes de guardar. Cada uno termina siendo
   un pedido propio, para que compras los mueva de estado por separado. */
let borrador = [];

function renderBorrador() {
  const ul = $('#pLista');
  ul.innerHTML = borrador.map((a, i) => `
    <li class="ped-item">
      <span class="ped-item-cant">×${a.cantidad}</span>
      <span class="ped-item-desc">${escapar(a.descripcion)}</span>
      <button type="button" class="ped-item-quitar" data-quitar="${i}" title="Quitar">×</button>
    </li>`).join('');
  ul.classList.toggle('hidden', !borrador.length);
  $('#hPedTitulo').textContent = borrador.length
    ? `Nuevo pedido · ${borrador.length} artículo${borrador.length === 1 ? '' : 's'}`
    : 'Nuevo pedido';
}

$('#pLista').addEventListener('click', ev => {
  const b = ev.target.closest('[data-quitar]');
  if (!b) return;
  borrador.splice(Number(b.dataset.quitar), 1);
  renderBorrador();
});

/* Pasa lo escrito a la lista y deja los campos listos para el siguiente. */
function sumarArticulo() {
  const descripcion = enMinuscula($('#pDescripcion').value);
  if (!descripcion) { $('#pDescripcion').focus(); return false; }
  borrador.push({ descripcion, cantidad: Number($('#pCantidad').value) || 1 });
  $('#pDescripcion').value = '';
  $('#pCantidad').value = 1;
  renderBorrador();
  $('#pDescripcion').focus();
  return true;
}

$('#btnAgregarArticulo').onclick = sumarArticulo;

function abrirHojaPedido(idx = null) {
  const v = vehiculoPorId(vehiculoAbierto);
  const e = v && estadiaActual(v);
  if (!e) return;
  pedidoEditando = idx;
  const p = idx === null ? {} : (e.pedidos?.[idx] || {});
  borrador = [];
  renderBorrador();

  $('#hPedTitulo').textContent = idx === null ? 'Nuevo pedido' : 'Editar pedido';
  // El vehículo y el solicitante salen del contexto: no se preguntan.
  $('#hPedMeta').textContent = idx === null
    ? formatearPatente(v.patente)
    : `${formatearPatente(v.patente)} · ${pedidoEstadoPorId(p.estado).label} · solicitado ${fechaRelativa(p.fecha)}`;
  $('#pDescripcion').value = p.descripcion || '';
  $('#pCantidad').value = p.cantidad || 1;

  // Editando un pedido existente se toca solo ese: sin lista ni "+".
  $('#zonaAgregar').classList.toggle('hidden', idx !== null);
  $('#btnBorrarPedido').classList.toggle('hidden', idx === null);
  abrirHoja('#hojaPedido');
  $('#pDescripcion').focus();
}

$('#btnNuevoPedido').onclick = () => abrirHojaPedido();

$('#formPedido').addEventListener('submit', ev => {
  ev.preventDefault();
  const v = vehiculoPorId(vehiculoAbierto);
  const e = v && estadiaActual(v);
  if (!e) return;

  const descripcion = enMinuscula($('#pDescripcion').value);
  e.pedidos ||= [];

  if (pedidoEditando !== null) {
    // Edición de un pedido existente: se conserva lo que puso compras.
    if (!descripcion) { cerrarHojas(); return; }
    const anterior = e.pedidos[pedidoEditando] || {};
    e.pedidos[pedidoEditando] = {
      ...anterior,
      descripcion,
      cantidad: Number($('#pCantidad').value) || 1,
    };
  } else {
    // Alta: lo que quedó escrito se suma a la lista y se guarda todo junto.
    if (descripcion) sumarArticulo();
    if (!borrador.length) { cerrarHojas(); return; }

    const base = {
      solicitante: usuario?.nombre || localStorage.getItem('ultimoOperario') || '',
      estado: PEDIDO_DEFECTO,
      fecha: hoyISO(),
    };
    for (const a of borrador) e.pedidos.push({ ...base, ...a });
    borrador = [];
  }

  guardarVehiculo(v);
  cerrarHojas();
  renderDetalle();
});

$('#btnBorrarPedido').onclick = () => {
  const v = vehiculoPorId(vehiculoAbierto);
  const e = v && estadiaActual(v);
  if (!e || pedidoEditando === null) return;
  if (!confirm('¿Eliminar este pedido?')) return;
  e.pedidos.splice(pedidoEditando, 1);
  guardarVehiculo(v);
  cerrarHojas();
  renderDetalle();
};

/* ---------- Estado de la conexión ---------- */

function mostrarConexion(ok, usr) {
  const el = $('#mConexion');
  const pend = cambiosPendientes();
  if (!HAY_SERVIDOR) {
    el.className = 'm-conexion local';
    el.textContent = 'sin servidor';
    return;
  }
  el.className = 'm-conexion ' + (ok ? 'ok' : 'off');
  el.textContent = ok
    ? (usr ? usr.nombre : 'en línea')
    : (pend ? `sin señal · ${pend} sin enviar` : 'sin señal');
}

/* ---------- Arranque ---------- */

$('#hSectores').innerHTML = SECTORES.map(s => `<option value="${s}">`).join('');
renderLista();

iniciarSync(() => {
  renderLista();
  if (vehiculoAbierto) renderDetalle();
}, mostrarConexion);
mostrarConexion(false);
