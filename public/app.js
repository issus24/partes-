/* ============================================================
   Parte de Trabajo — vista de escritorio.
   Una pantalla por día: patente, problemas, novedades del día,
   estado y fecha de ingreso. Requiere core.js cargado antes.
   ============================================================ */

const vista = {
  fecha: hoyISO(),               // día que se está viendo
  buscar: '',
  estadosVisibles: new Set(ESTADOS.map(e => e.id)),
  ocultarTerminados: false,
};

let vehiculoEditando = null;   // id o null (=nuevo)
let celdaEditando = null;      // { vehiculoId, fecha, idx }

const $ = sel => document.querySelector(sel);

/* ---------- Render ---------- */

function vehiculosFiltrados() {
  const q = vista.buscar.trim();
  return datos.vehiculos.filter(v => {
    // Terminada la reparación, la unidad figura hasta el día en que se
    // cerró —ahí queda el sello— y desaparece del parte a partir del
    // día siguiente. Hacia atrás se sigue viendo su historia.
    if (v.finalizado && vista.fecha > v.finalizado) return false;

    if (!vista.estadosVisibles.has(v.estado)) return false;
    if (vista.ocultarTerminados && v.estado === 'operativo') return false;
    if (!q) return true;
    return normalizar(textoBuscable(v)).includes(normalizar(q));
  });
}

function render() {
  const f = vista.fecha;
  const hoy = hoyISO();
  const lista = vehiculosFiltrados();

  // --- Encabezado del día ---
  $('#diaTitulo').textContent = fechaLargaCompleta(f);
  $('#diaRel').textContent = fechaRelativa(f);
  $('#diaRel').className = 'dia-rel' + (f === hoy ? ' es-hoy' : '');
  $('#diaFecha').value = f;
  $('#novDia').textContent = `— ${fechaCorta(f)}`;
  document.body.classList.toggle('viendo-hoy', f === hoy);

  // --- Filas ---
  const tbody = $('#tbody');
  tbody.innerHTML = '';

  for (const v of lista) {
    const est = estadoPorId(v.estado);
    const dias = diasEnTaller(v);
    const cerrado = estaFinalizado(v);
    const updates = v.updates?.[f] || [];
    const abiertos = pedidosAbiertos(v).length;

    const tr = document.createElement('tr');
    tr.className = 'fila' + (cerrado ? ' fila-cerrada' : '');
    tr.style.setProperty('--est', est.color);
    tr.dataset.id = v.id;

    tr.innerHTML = `
      <td class="c-pat">
        <button type="button" class="pat" data-editar="${v.id}" title="Editar vehículo">
          ${patenteHTML(v.patente)}
        </button>
        ${abiertos ? `<span class="veh-pedidos" title="${abiertos} pedido(s) de repuestos sin cerrar">⛭ ${abiertos}</span>` : ''}
      </td>

      <td class="c-prob">
        ${(v.problemas || []).length
          ? (v.problemas).map(p => {
              const c = categoriaPorId(p.categoria);
              return `<span class="prob" style="--cat:${c.color}">
                        <span class="prob-ini" title="${escapar(c.label)}">${c.inicial}</span>
                        <span class="prob-txt">${escapar(p.texto)}</span>
                      </span>`;
            }).join('')
          : '<span class="nada">Sin problemas cargados</span>'}
      </td>

      <td class="c-nov">
        <div class="novedades">
          ${updates.map((u, i) => `
            <div class="upd" data-idx="${i}" style="border-left-color:${colorSector(u.sector)}">
              ${u.sector ? `<span class="upd-sector">${escapar(u.sector)}</span>` : ''}
              <span class="upd-texto">${escapar(u.texto || '')}</span>
              ${u.operario ? `<span class="upd-pie">${escapar(u.operario)}</span>` : ''}
            </div>`).join('')}
          <button type="button" class="btn-add-upd" data-nueva title="Agregar novedad de este día">
            + Novedad
          </button>
        </div>
      </td>

      <td class="c-est">
        <select class="sel-estado" data-estado="${v.id}" style="--est:${est.color}">
          ${ESTADOS.map(e => `<option value="${e.id}"${e.id === v.estado ? ' selected' : ''}>${e.label}</option>`).join('')}
        </select>
      </td>

      <td class="c-ing">
        ${v.ingreso ? `<span class="ing-fecha">${fechaCorta(v.ingreso)}/${v.ingreso.slice(2, 4)}</span>` : '<span class="nada">—</span>'}
        ${dias !== null ? `<span class="ing-dias ${cerrado ? 'cerrado' : dias >= 15 ? 'alerta' : ''}">${dias} día${dias === 1 ? '' : 's'}</span>` : ''}
        ${cerrado ? selloHTML(v) : ''}
      </td>

      <td class="c-acc">
        <button type="button" class="btn-ficha" data-repuestos="${v.id}" title="Ver repuestos solicitados">
          ⛭ Repuestos${abiertos ? ` <b>${abiertos}</b>` : ''}
        </button>
        <button type="button" class="btn-ficha" data-parte="${v.id}" title="Ver el parte de trabajo completo">
          🗒 Parte
        </button>
      </td>

      <td class="c-fill"></td>`;

    tbody.appendChild(tr);
  }

  ajustarAnchos(lista);

  // --- Auxiliares ---
  $('#contador').textContent = `${lista.length} de ${datos.vehiculos.length} vehículo${datos.vehiculos.length === 1 ? '' : 's'}`;
  $('#vacio').classList.toggle('hidden', datos.vehiculos.length > 0);
}

/* Sello de finalizado. La animación de estampado corre una sola vez por
   vehículo: como render() rehace la tabla entera, sin este registro se
   repetiría en cada redibujado. */
const sellosEstampados = new Set();

function selloHTML(v) {
  const nuevo = !sellosEstampados.has(v.id);
  sellosEstampados.add(v.id);
  return `<span class="sello${nuevo ? ' estampando' : ''}">
            <span class="sello-txt">Finalizado</span>
            <span class="sello-fecha">${fechaCorta(v.finalizado)}/${v.finalizado.slice(2, 4)}</span>
          </span>`;
}

/* Anchos calculados:
   · Problemas   → lo que necesite el texto más largo en pantalla.
   · Novedades   → la mitad del espacio que sobra (el resto queda libre,
                   absorbido por la columna vacía del final).
   El resto de las columnas tiene ancho fijo en el CSS. */
const ANCHO_PAT = 210, ANCHO_EST = 210, ANCHO_ING = 175, ANCHO_ACC = 130;

function ajustarAnchos(lista) {
  const masLargo = lista.reduce((max, v) =>
    (v.problemas || []).reduce((m, p) => Math.max(m, p.texto.length), max), 0);
  const prob = Math.min(560, Math.max(200, Math.round(masLargo * 7.1) + 62));

  const total = document.querySelector('.tabla-wrap').clientWidth;
  const sobra = total - (ANCHO_PAT + prob + ANCHO_EST + ANCHO_ING + ANCHO_ACC);
  const nov = Math.max(240, Math.round(sobra * 0.5));

  const tabla = document.querySelector('.parte');
  tabla.style.setProperty('--ancho-prob', prob + 'px');
  tabla.style.setProperty('--ancho-nov', nov + 'px');
}

/* Al cambiar el tamaño de la ventana se recalculan. */
addEventListener('resize', () => ajustarAnchos(vehiculosFiltrados()));

/* "lunes 2 de agosto de 2026" */
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS_LARGO = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

function fechaLargaCompleta(iso) {
  const d = isoADate(iso);
  return `${DIAS_LARGO[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`;
}

/* ---------- Navegación por día ---------- */

function irADia(iso) {
  vista.fecha = iso;
  render();
}

$('#btnDiaPrev').onclick = () => irADia(sumarDias(vista.fecha, -1));
$('#btnDiaNext').onclick = () => irADia(sumarDias(vista.fecha, 1));
$('#btnHoy').onclick = () => irADia(hoyISO());
$('#diaFecha').onchange = e => { if (e.target.value) irADia(e.target.value); };

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
      texto: enMinuscula(f.querySelector('.prob-texto').value),
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
      descripcion: enMinuscula(f.querySelector('.ped-desc').value),
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
  $('#vPatente').value = v ? formatearPatente(v.patente) : '';
  $('#vMarca').value = v?.marca || '';
  $('#vModelo').value = v?.modelo || '';
  $('#vChasis').value = v?.chasis || '';
  $('#vMotor').value = v?.motor || '';
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
  const patente = normalizarPatente($('#vPatente').value);
  if (!patente) return;
  const campos = {
    patente,
    marca: enMinuscula($('#vMarca').value),
    modelo: enMinuscula($('#vModelo').value),
    chasis: enCodigo($('#vChasis').value),
    motor: enCodigo($('#vMotor').value),
    ingreso: $('#vIngreso').value,
    problemas: leerProblemas(),
    pedidos: leerPedidos(),
  };

  let v;
  if (vehiculoEditando) {
    v = Object.assign(vehiculoPorId(vehiculoEditando), campos);
  } else {
    v = { id: nuevoId(), ...campos, estado: ESTADO_DEFECTO, updates: {} };
    datos.vehiculos.push(v);
  }
  cambiarEstado(v, $('#vEstado').value);
  guardarVehiculo(v);
  render();
});

$('#btnBorrarVehiculo').addEventListener('click', () => {
  const v = vehiculoPorId(vehiculoEditando);
  if (!v) return;
  if (!confirm(`¿Eliminar ${formatearPatente(v.patente)} y todas sus novedades?`)) return;
  borrarVehiculoRemoto(vehiculoEditando);
  render();
  $('#dlgVehiculo').close();
});

/* ---------- Novedades ---------- */

/* idx = null → nueva novedad; idx = número → editar la existente. */
function abrirUpdate(vehiculoId, fecha, idx = null) {
  const v = vehiculoPorId(vehiculoId);
  if (!v) return;
  celdaEditando = { vehiculoId, fecha, idx };
  const u = idx === null ? {} : (v.updates?.[fecha]?.[idx] || {});
  const cantidad = (v.updates?.[fecha] || []).length;

  $('#updTitulo').textContent = idx === null ? 'Nueva novedad' : 'Editar novedad';
  $('#updMeta').textContent = `${formatearPatente(v.patente)} — ${fechaLarga(fecha)}` +
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
    sector: enMinuscula($('#uSector').value),
    texto: enMinuscula($('#uTexto').value),
    operario: enMinuscula($('#uOperario').value),
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
  if (!confirm('¿Eliminar esta novedad?')) return;
  lista.splice(idx, 1);
  if (!lista.length) delete v.updates[fecha];
  guardarVehiculo(v);
  render();
  $('#dlgUpdate').close();
});

/* ---------- Planilla de repuestos ---------- */

/* ---------- Orientación de la hoja ----------
   Una regla @page no se puede condicionar desde CSS, así que la escribe
   el JS según qué ficha se está por imprimir. */
const hojaEstilo = document.createElement('style');
document.head.appendChild(hojaEstilo);

function orientarHoja(modo) {
  hojaEstilo.textContent = modo === 'apaisada'
    ? '@page { size: A4 landscape; margin: 10mm; }'
    : '@page { size: A4 portrait; margin: 10mm 14mm 14mm; }';
}

orientarHoja('vertical');

/* Encabezado común de las dos fichas: título, patente y fecha. */
function encabezadoDoc(v, titulo) {
  return `
    <h1 class="doc-titulo">${titulo}</h1>
    <header class="doc-id">
      ${patenteHTML(v.patente)}
      <div class="doc-fecha">
        <span class="doc-fecha-lbl">Fecha</span>
        <span class="doc-fecha-val">${fechaLarga(hoyISO())}</span>
      </div>
    </header>`;
}

/* Datos técnicos. Se dibujan siempre, aunque falte cargarlos: el hueco
   deja ver qué falta y sirve para completar a mano sobre el papel. */
function tecnicosHTML(v) {
  const dato = (lbl, val, mono) => `
    <div class="doc-tec">
      <span class="doc-dato-lbl">${lbl}</span>
      <span class="doc-tec-val${mono ? ' mono' : ''}">${val ? escapar(val) : '—'}</span>
    </div>`;
  return `<div class="doc-tecnicos">
    ${dato('Marca', v.marca)}
    ${dato('Modelo', v.modelo)}
    ${dato('N° de chasis', v.chasis, true)}
    ${dato('N° de motor', v.motor, true)}
  </div>`;
}

function abrirRepuestos(id) {
  const v = vehiculoPorId(id);
  if (!v) return;
  const peds = v.pedidos || [];
  const abiertos = pedidosAbiertos(v).length;
  const total = peds.reduce((n, p) => n + (Number(p.cantidad) || 1), 0);

  $('#cuerpoRepuestos').innerHTML = `
    <article class="doc">
      ${encabezadoDoc(v, 'Repuestos solicitados')}

      <section class="doc-seccion">
        <h2>Datos técnicos</h2>
        ${tecnicosHTML(v)}
      </section>

      <section class="doc-seccion">
        <h2>Repuestos</h2>
        ${peds.length ? `
          <table class="planilla">
            <thead>
              <tr>
                <th class="col-num">Cant.</th>
                <th>Artículo</th>
                <th class="col-med">Estado</th>
                <th class="col-med">Solicitó</th>
                <th class="col-chico">Pedido</th>
              </tr>
            </thead>
            <tbody>
              ${peds.map(p => {
                const e = pedidoEstadoPorId(p.estado);
                return `<tr>
                  <td class="col-num">${p.cantidad || 1}</td>
                  <td>${escapar(p.descripcion)}${p.nota ? `<span class="sub-nota">${escapar(p.nota)}</span>` : ''}</td>
                  <td class="col-med"><span class="pill" style="--c:${e.color}">${e.label}</span></td>
                  <td class="col-med">${escapar(p.solicitante || '—')}</td>
                  <td class="col-chico">${p.fecha ? fechaCorta(p.fecha) : '—'}</td>
                </tr>`;
              }).join('')}
            </tbody>
            <tfoot>
              <tr>
                <td class="col-num">${total}</td>
                <td colspan="4">
                  ${peds.length} artículo${peds.length === 1 ? '' : 's'} · ${abiertos} sin cerrar
                </td>
              </tr>
            </tfoot>
          </table>` : '<p class="planilla-vacia">Esta unidad no tiene repuestos solicitados.</p>'}
      </section>
    </article>`;

  orientarHoja('vertical');
  $('#dlgRepuestos').showModal();
}

/* ---------- Planilla del parte de trabajo ---------- */

function abrirParte(id) {
  const v = vehiculoPorId(id);
  if (!v) return;
  const dias = diasEnTaller(v);
  const est = estadoPorId(v.estado);
  const fechas = fechasConUpdates(v);
  const peds = v.pedidos || [];

  const problemas = (v.problemas || []).map(p => {
    const c = categoriaPorId(p.categoria);
    return `<li>
              <span class="prob-ini" style="--cat:${c.color}">${c.inicial}</span>
              <span class="doc-prob-txt">${escapar(p.texto)}</span>
              <span class="doc-prob-cat">${escapar(c.label)}</span>
            </li>`;
  }).join('');

  $('#cuerpoParte').innerHTML = `
    <article class="doc">
      ${encabezadoDoc(v, 'Parte de trabajo')}

      <section class="doc-seccion">
        <h2>Datos técnicos</h2>
        ${tecnicosHTML(v)}
      </section>

      <section class="doc-seccion">
        <h2>Problemas de ingreso</h2>
        ${problemas ? `<ul class="doc-problemas">${problemas}</ul>`
                    : '<p class="planilla-vacia">Sin problemas cargados.</p>'}
      </section>

      <section class="doc-seccion">
        <h2>Repuestos utilizados</h2>
        ${peds.length ? `
          <table class="planilla">
            <thead>
              <tr>
                <th class="col-num">Cant.</th>
                <th>Artículo</th>
                <th class="col-med">Estado</th>
                <th class="col-med">Solicitó</th>
                <th class="col-chico">Pedido</th>
              </tr>
            </thead>
            <tbody>
              ${peds.map(p => {
                const e = pedidoEstadoPorId(p.estado);
                return `<tr>
                  <td class="col-num">${p.cantidad || 1}</td>
                  <td>${escapar(p.descripcion)}${p.nota ? `<span class="sub-nota">${escapar(p.nota)}</span>` : ''}</td>
                  <td class="col-med"><span class="pill" style="--c:${e.color}">${e.label}</span></td>
                  <td class="col-med">${escapar(p.solicitante || '—')}</td>
                  <td class="col-chico">${p.fecha ? fechaCorta(p.fecha) : '—'}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>` : '<p class="planilla-vacia">No se pidieron repuestos para esta unidad.</p>'}
      </section>

      <section class="doc-seccion doc-cierre">
        <div class="doc-datos">
          <div class="doc-dato">
            <span class="doc-dato-lbl">Fecha de ingreso</span>
            <span class="doc-dato-val">${v.ingreso ? fechaLarga(v.ingreso) : '—'}</span>
          </div>
          <div class="doc-dato">
            <span class="doc-dato-lbl">Días en taller</span>
            <span class="doc-dato-val doc-dato-grande">${dias === null ? '—' : dias}</span>
          </div>
          <div class="doc-dato">
            <span class="doc-dato-lbl">Estado</span>
            <span class="doc-dato-val"><span class="pill" style="--c:${est.color}">${est.label}</span></span>
          </div>
        </div>
        ${estaFinalizado(v) ? `
          <span class="sello sello-doc">
            <span class="sello-txt">Finalizado</span>
            <span class="sello-fecha">${fechaCorta(v.finalizado)}/${v.finalizado.slice(2, 4)}</span>
          </span>` : ''}
      </section>

      <section class="doc-seccion">
        <h2>Novedades</h2>
        ${fechas.length ? `
          <table class="planilla">
            <thead>
              <tr>
                <th class="col-med">Fecha</th>
                <th class="col-med">Sector</th>
                <th>Novedad</th>
                <th class="col-med">Responsable</th>
              </tr>
            </thead>
            <tbody>
              ${fechas.map(f => v.updates[f].map((u, i) => `
                <tr${i === 0 ? ' class="dia-nuevo"' : ''}>
                  <td class="col-med">${i === 0 ? fechaLarga(f) : ''}</td>
                  <td class="col-med"><span class="pill" style="--c:${colorSector(u.sector)}">${escapar(u.sector || '—')}</span></td>
                  <td>${escapar(u.texto || '')}</td>
                  <td class="col-med">${escapar(u.operario || '—')}</td>
                </tr>`).join('')).join('')}
            </tbody>
          </table>` : '<p class="planilla-vacia">Todavía no hay novedades cargadas.</p>'}
      </section>
    </article>`;

  orientarHoja('vertical');
  $('#dlgParte').showModal();
}

/* ---------- Reporte del día ---------- */

/* En papel conviene el texto corrido: los problemas y las novedades van
   uno seguido del otro separados por un punto medio, en vez de apilados
   como en la pantalla. Entran muchas más unidades por hoja. */
function abrirReporte() {
  const f = vista.fecha;
  const lista = vehiculosFiltrados();

  const filas = lista.map(v => {
    const est = estadoPorId(v.estado);
    const dias = diasEnTaller(v);

    const problemas = (v.problemas || []).map(p => {
      const c = categoriaPorId(p.categoria);
      return `<span class="r-item"><b class="r-ini" style="--cat:${c.color}">${c.inicial}</b>${escapar(p.texto)}</span>`;
    }).join('<span class="r-sep">·</span>');

    const novedades = (v.updates?.[f] || []).map(u =>
      `<span class="r-item">${u.sector ? `<b class="r-sector">${escapar(u.sector)}</b>` : ''}${escapar(u.texto || '')}${u.operario ? ` <i>(${escapar(u.operario)})</i>` : ''}</span>`
    ).join('<span class="r-sep">·</span>');

    return `<tr>
      <td class="r-pat">${escapar(formatearPatente(v.patente))}</td>
      <td>${problemas || '<span class="r-vacio">—</span>'}</td>
      <td>${novedades || '<span class="r-vacio">sin novedades</span>'}</td>
      <td class="r-est"><span class="pill" style="--c:${est.color}">${est.label}</span></td>
      <td class="r-ing">
        <div class="r-ing-caja">
          <div>
            <span class="r-ing-fecha">${v.ingreso ? fechaCorta(v.ingreso) : '—'}</span>
            ${dias !== null ? `<span class="r-dias">${dias} d</span>` : ''}
          </div>
          ${estaFinalizado(v) ? `
            <span class="sello sello-mini">
              <span class="sello-txt">Finalizado</span>
              <span class="sello-fecha">${fechaCorta(v.finalizado)}</span>
            </span>` : ''}
        </div>
      </td>
    </tr>`;
  }).join('');

  $('#cuerpoReporte').innerHTML = `
    <article class="doc doc-reporte">
      <h1 class="doc-titulo">Parte de trabajo</h1>

      <header class="doc-id">
        <div class="rep-dia">
          <span class="doc-fecha-lbl">Día</span>
          <span class="rep-dia-val">${fechaLargaCompleta(f)}</span>
        </div>
        <div class="doc-fecha">
          <span class="doc-fecha-lbl">Unidades</span>
          <span class="doc-fecha-val">${lista.length}</span>
        </div>
      </header>

      ${lista.length ? `
        <table class="planilla tabla-reporte">
          <thead>
            <tr>
              <th class="r-pat">Patente</th>
              <th>Problemas de ingreso</th>
              <th>Novedades del día</th>
              <th class="r-est">Estado</th>
              <th class="r-ing">Ingreso</th>
            </tr>
          </thead>
          <tbody>${filas}</tbody>
        </table>`
      : '<p class="planilla-vacia">No hay unidades para este día con los filtros aplicados.</p>'}
    </article>`;

  orientarHoja('apaisada');
  $('#dlgReporte').showModal();
}

$('#btnReporte').onclick = abrirReporte;

document.querySelectorAll('[data-imprimir]').forEach(b => b.onclick = () => window.print());

/* ---------- Interacción de la tabla ---------- */

$('#tbody').addEventListener('click', ev => {
  const editar = ev.target.closest('[data-editar]');
  if (editar) { abrirVehiculo(editar.dataset.editar); return; }

  const rep = ev.target.closest('[data-repuestos]');
  if (rep) { abrirRepuestos(rep.dataset.repuestos); return; }

  const parte = ev.target.closest('[data-parte]');
  if (parte) { abrirParte(parte.dataset.parte); return; }

  const fila = ev.target.closest('tr.fila');
  if (!fila) return;

  const bloque = ev.target.closest('.upd');
  if (bloque) return abrirUpdate(fila.dataset.id, vista.fecha, Number(bloque.dataset.idx));

  if (ev.target.closest('[data-nueva]')) abrirUpdate(fila.dataset.id, vista.fecha, null);
});

/* Cambiar el estado desde la tabla repinta la fila entera. */
$('#tbody').addEventListener('change', ev => {
  const sel = ev.target.closest('[data-estado]');
  if (!sel) return;
  const v = vehiculoPorId(sel.dataset.estado);
  if (!v) return;
  if (v.estado !== 'operativo') sellosEstampados.delete(v.id);   // que vuelva a animarse
  cambiarEstado(v, sel.value);
  guardarVehiculo(v);
  render();
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
    if (confirm('Esto borra TODOS los vehículos y novedades. ¿Continuar?')) {
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
  if (e.key === 'ArrowLeft') $('#btnDiaPrev').click();
  if (e.key === 'ArrowRight') $('#btnDiaNext').click();
  if (e.key === 'Home') $('#btnHoy').click();
  if (e.key.toLowerCase() === 'n') { e.preventDefault(); abrirVehiculo(); }
});

/* ---------- Estado de la conexión ---------- */

function mostrarConexion(ok, usr) {
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
    ? (usr ? `${usr.nombre} · en línea` : 'En línea')
    : `Sin conexión${pend ? ` · ${pend} sin enviar` : ''}`;
  el.title = ok ? 'Sincronizado con el servidor' : 'Los cambios se guardan y se envían al recuperar señal.';
}

/* ---------- Arranque ---------- */

llenarSelectEstados($('#vEstado'));
$('#listaSectores').innerHTML = SECTORES.map(s => `<option value="${s}">`).join('');
renderChips();
render();
iniciarSync(() => { renderChips(); render(); }, mostrarConexion);
mostrarConexion(false);
